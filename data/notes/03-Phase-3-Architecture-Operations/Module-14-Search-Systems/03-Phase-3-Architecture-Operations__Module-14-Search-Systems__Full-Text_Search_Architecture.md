# Full-Text Search Architecture

## Why This Exists

A database index on a `name` column answers `WHERE name = 'Alice'`. It cannot answer "find documents containing 'distributed' near 'systems', ranked by relevance" or "find products matching 'running shoes' with typo tolerance." Full-text search requires a fundamentally different data structure — the **inverted index** — and a fundamentally different ranking model — **BM25** — designed not just to find matching documents but to rank them by how well they match.

Search is also a user-facing feature with tight latency requirements (<200ms), subjective quality ("the results don't feel right"), and constant tuning. Building a search system is 20% indexing and 80% relevance engineering.


## Mental Model

A book index, but for the entire internet. The index at the back of a textbook maps words to page numbers: "TCP → pages 14, 27, 93." An inverted index does the same thing for documents: "distributed → doc_42, doc_187, doc_2001." When you search for "distributed consensus," the search engine finds all documents containing "distributed," all documents containing "consensus," intersects the lists, then ranks the results by relevance (BM25 scoring: how rare is the word? how frequently does it appear in this specific document? how long is the document?). The index is pre-built so that search is a lookup, not a scan — you never read every document to find a match.

## How It Works

### The Inverted Index

A forward index maps: document → words it contains. An inverted index maps: word → documents containing it.

```
Forward index (useless for search):
  doc_1 → ["distributed", "systems", "consensus", "raft"]
  doc_2 → ["distributed", "caching", "redis"]

Inverted index (what search engines use):
  "distributed" → [doc_1, doc_2]
  "systems"     → [doc_1]
  "consensus"   → [doc_1]
  "caching"     → [doc_2]
  "redis"       → [doc_2]
```

Searching "distributed systems" intersects the posting lists for each term: `doc_1` appears in both → it matches. Each posting list entry typically also stores the term's position within the document (for phrase queries like "distributed systems" — the words must appear adjacent) and the term frequency (for relevance scoring).

### Text Analysis Pipeline

Raw text isn't indexed directly. It passes through an **analysis pipeline** that normalizes it:

1. **Character filtering**: Strip HTML tags, convert special characters. `<b>Hello</b> World!` → `Hello World!`
2. **Tokenization**: Split text into tokens. `"New York City"` → `["New", "York", "City"]` (standard tokenizer) or `["New York City"]` (keyword tokenizer — depends on use case).
3. **Lowercasing**: `"Alice"` → `"alice"`. Enables case-insensitive matching.
4. **Stemming / Lemmatization**: Reduce words to their root form. `"running"` → `"run"`, `"systems"` → `"system"`, `"better"` → `"good"` (lemmatization). This means searching for "run" matches documents containing "running", "runs", "runner".
5. **Stop word removal** (optional): Remove common words like "the", "is", "at" that add noise. Modern search engines often keep stop words for phrase matching ("to be or not to be" loses meaning without stop words).
6. **Synonym expansion** (optional): `"automobile"` → also index as `"car"`. Increases recall (more results) at the cost of precision (some results less relevant).

**The critical detail**: The same pipeline must run at both index time and query time. If the index stems "running" to "run" but the query doesn't stem, the query "running" won't match the indexed term "run."

### Relevance Ranking: BM25

When a query matches thousands of documents, ranking determines which appear first. **BM25** (Best Matching 25) is the industry standard, an evolution of TF-IDF:

**Term Frequency (TF)**: A document mentioning "distributed" 10 times is more relevant than one mentioning it once — but with diminishing returns. BM25's saturation parameter `k1` controls this: high `k1` means more credit for repeated terms; low `k1` means a single mention is almost as good as ten.

**Inverse Document Frequency (IDF)**: A term appearing in 90% of documents ("the") is less informative than one in 1% ("consensus"). IDF down-weights common terms. This is why searching "the distributed systems" effectively searches for "distributed systems" — "the" has near-zero IDF.

**Document length normalization**: A 100-word document mentioning "distributed" 5 times is more focused (and likely more relevant) than a 10,000-word document mentioning it 5 times. BM25 normalizes by document length relative to the average document length in the index. Parameter `b` controls the strength of length normalization.

**BM25 formula** (simplified):
```
score(q, d) = Σ IDF(t) × (TF(t,d) × (k1 + 1)) / (TF(t,d) + k1 × (1 - b + b × |d|/avgdl))
```

In practice, you rarely tune BM25 parameters directly. The defaults (`k1=1.2`, `b=0.75`) work well for most corpora. Relevance tuning focuses on the analysis pipeline (better tokenization, synonyms, stemming) and query-time boosting (title matches score 3× body matches).

### Elasticsearch / OpenSearch Cluster Architecture

Elasticsearch (and its open-source fork OpenSearch) is the dominant full-text search engine. Understanding its architecture is essential for operating search at scale.

**Index structure**: An Elasticsearch index is divided into **shards**. Each shard is a complete, self-contained Lucene index. Shards are distributed across cluster nodes. Each shard can have replicas (copies on other nodes) for fault tolerance and read throughput.

**Write path**: A document is routed to a primary shard (deterministic: `shard = hash(document_id) % num_shards`). The primary indexes the document (inverted index update), then forwards to replica shards. The write is acknowledged when the primary + configured number of replicas have indexed it.

**Read (search) path**: A query is sent to one copy (primary or replica) of every shard — the **scatter** phase. Each shard runs the query against its local Lucene index, scores and ranks results locally, and returns the top N. The coordinating node **gathers** results from all shards, merges them by score, and returns the global top N.

**Shard sizing**: Each shard is a Lucene index with fixed overhead (~50–100MB of memory for metadata). Too few shards → uneven distribution, hot nodes, hard to rebalance. Too many shards → excessive overhead, slow cluster state updates, GC pressure. **Rule of thumb**: 10–50GB per shard. A 500GB index needs 10–50 shards. Elasticsearch does NOT allow changing shard count after index creation — you must reindex.

**Index lifecycle management (ILM)**: For time-series data (logs, events), use rollover indices: create a new index daily/weekly, alias points to the current index. Old indices can be force-merged (reduce segments for faster reads), moved to cheaper nodes (warm/cold architecture), or deleted. This pattern avoids the "shard count wrong at creation" problem by creating new indices regularly.

## Search as Infrastructure

### Query Understanding

Raw user queries are messy. A production search system preprocesses queries before matching:

**Spell correction**: `"distribted systems"` → `"distributed systems"`. Implemented via edit distance (Levenshtein) against the index's term dictionary. Elasticsearch's `suggest` API provides this.

**Synonym expansion**: User searches "k8s" → expand to "kubernetes". Configured in the analysis pipeline or at query time.

**Query classification**: Detect query intent. Is "apple" a fruit search or a company search? Use context (the user's recent activity, the search domain) to disambiguate.

### Autocomplete

Suggestions as the user types. Two approaches:

**Prefix matching**: Index terms with an edge-ngram tokenizer (`"distributed"` → `["d", "di", "dis", "dist", ...]`). The prefix query matches instantly against these pre-computed ngrams. Fast but only matches from the beginning of words.

**Completion suggester** (Elasticsearch): A purpose-built, in-memory data structure (FST — Finite State Transducer) that provides sub-millisecond prefix completions. Stored entirely in memory — very fast, but consumes RAM proportional to the vocabulary size.

**Search-as-you-type**: Combine prefix matching on the current word with full-text matching on completed words. `"distrib sys"` matches "distributed systems" — "distrib" is a prefix match, "sys" is a prefix match, and the combination is scored.

### Faceting and Aggregations

"Show me products in category 'Electronics', priced $50–$100, with 4+ star reviews" — with counts per facet value (how many products match each price range, each category, each rating bucket). This is faceted search.

Elasticsearch implements faceting via **aggregations**: bucket aggregations (group by category), range aggregations (price buckets), metric aggregations (average rating per bucket). Aggregations run during the search query — the same scatter-gather over all shards, but each shard also computes its local aggregation, and the coordinator merges.

**Performance concern**: Aggregations on high-cardinality fields (user IDs, product IDs — millions of unique values) are expensive. They require building large in-memory hash maps on each shard. Use `composite` aggregation with pagination for high-cardinality cases.

### Pagination at Scale

**Offset-based** (`from: 1000, size: 10`): Simple but each shard must return 1010 results to the coordinator (so the coordinator can find the global top 1000–1010). At `from: 10000`, each shard returns 10010 results — memory and CPU explode. Elasticsearch hard-limits `from + size` to 10,000 by default.

**Search-after** (cursor-based): Use the sort value of the last result as the starting point for the next page. Each shard only needs to find results after that sort value — bounded work regardless of page depth. The production approach for deep pagination.

**Scroll API**: For bulk export (not user-facing pagination). Opens a snapshot of the search results and iterates through all of them. Suitable for exporting search results to another system.

## Trade-Off Analysis

| System | Query Capabilities | Operational Complexity | Write Latency | Best For |
|--------|-------------------|----------------------|--------------|----------|
| Elasticsearch | Full-text, aggregations, geo, vector | High — cluster management, JVM tuning, shard management | Near real-time (1s refresh) | Log analytics, e-commerce search, observability |
| OpenSearch | Same as Elasticsearch (fork) | High — same ops model | Near real-time | AWS-native, open-source Elasticsearch alternative |
| Solr | Full-text, faceting | Medium — simpler than ES for basic use | Near real-time | Legacy search, stable deployments |
| Meilisearch | Full-text, typo-tolerant | Low — single binary | Near real-time | Small datasets, developer-friendly, instant search |
| Typesense | Full-text, typo-tolerant | Low — single binary | Near real-time | Small-medium datasets, low-latency search-as-you-type |
| PostgreSQL full-text | Basic full-text with tsvector/tsquery | None — built into your DB | Immediate (transactional) | Simple search on existing PostgreSQL data |

**Don't reach for Elasticsearch until PostgreSQL fails you**: PostgreSQL's built-in full-text search with `tsvector` and GIN indexes handles simple search surprisingly well — keyword search, ranking, highlighting. It's transactional, needs no additional infrastructure, and works for most applications under 10M documents. Add Elasticsearch when you need fuzzy matching, complex aggregations, or are indexing hundreds of millions of documents.

## Failure Modes

- **Relevance cliff**: Search returns results that are technically matches but feel irrelevant. Users lose trust and stop using search. Root cause is usually poor analysis (no stemming, no synonyms) or missing field boosting (title should rank higher than body). Relevance tuning is ongoing, not a one-time setup.

- **Shard allocation imbalance**: Some nodes have more/larger shards than others. Hot nodes become bottlenecks while cold nodes are idle. Mitigation: Elasticsearch's automatic shard allocation balances by shard count, but not by shard size. Use allocation awareness (zone-aware sharding) and monitor per-node disk/CPU.

- **Mapping explosion**: A field with dynamic mapping creates a new field for every unique key (e.g., indexing arbitrary JSON). The mapping grows to thousands of fields, consuming memory and slowing indexing. Mitigation: use strict mappings (reject unknown fields) or `flattened` field type for dynamic JSON.

- **Cluster state bottleneck**: Cluster state (index metadata, mappings, shard allocation) is stored in memory on every node and must be synchronized. With thousands of indices and tens of thousands of shards, cluster state updates become slow and consume memory. Mitigation: reduce index/shard count (ILM deletes old indices), use data streams instead of per-day indices.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Indexing Pipeline"
        Doc[Raw Document] --> Filter[Char Filter: Strip HTML]
        Filter --> Token[Tokenizer: Split Words]
        Token --> Normalize[Token Filter: Lowercase/Stem]
        Normalize --> Index[(Inverted Index)]
    end

    subgraph "Query Path (Scatter-Gather)"
        User[Search Query] --> Coord[Coordinating Node]
        Coord --> Shard1[Shard 1 - Lucene]
        Coord --> Shard2[Shard 2 - Lucene]
        Coord --> Shard3[Shard 3 - Lucene]
        
        Shard1 & Shard2 & Shard3 -->|Top N Results| Coord
        Coord -->|Merge & Rank| Final[Ranked Results]
    end

    style Index fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Shard1 fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **Shard Size**: Aim for **10GB - 50GB** per shard. Shards smaller than 1GB waste resources; shards larger than 50GB make rebalancing and recovery slow.
- **Refresh Interval**: The default `index.refresh_interval` is **1 second**. Increasing this to 30s can improve indexing throughput by **~20%** at the cost of "near real-time" visibility.
- **Memory (JVM Heap)**: Limit the Elasticsearch JVM heap to **50% of available RAM** (max 32GB to keep compressed pointers). The remaining 50% is used by the OS Page Cache for Lucene segments.
- **Search Latency**: A well-tuned cluster should achieve **p99 < 200ms** for simple keyword queries. Aggregations on high-cardinality fields can easily push this into seconds.

## Real-World Case Studies

- **Wikipedia (Elasticsearch)**: Wikipedia uses Elasticsearch to power search for millions of articles in hundreds of languages. They rely heavily on **Stemming** and **Language-specific Analyzers** to ensure that a search for "learning" matches articles containing "learn" or "learned" across different linguistic contexts.
- **Uber (Marketplace Search)**: Uber uses search architecture not just for text, but for **Geo-Spatial Search**. They index driver locations as documents and use Elasticsearch's BKD-tree based geo-indexes to find the "nearest available drivers" to a user in sub-100ms, effectively treating the city as a searchable document.
- **Slack (Search at Scale)**: Slack built a custom search architecture called **SolrCloud** (and later moved toward specialized services). They face a unique challenge: every user has a different "View" of the data (only messages in channels they are in). They use **Routing** to ensure that a user's query only hits the shards containing their specific workspace's data, avoiding a global scatter-gather.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]] — Combining BM25 keyword search with vector similarity for better relevance
- [[01-Phase-1-Foundations__Module-04-Databases__Indexing_Deep_Dive]] — Inverted indexes are a fundamentally different structure from B-tree/LSM indexes
- [[01-Phase-1-Foundations__Module-04-Databases__Partitioning_and_Sharding]] — Elasticsearch sharding follows the same principles as database sharding
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Cache_Patterns_and_Strategies]] — Search result caching (query cache, request cache, field data cache) is critical for performance

## Reflection Prompts

1. Your e-commerce search returns "iPhone case" when a user searches "phone case" but misses "mobile phone cover" and "cell phone protector." What analysis pipeline changes would fix this? Walk through tokenization, stemming, and synonyms for this example.

2. Your Elasticsearch cluster has 30 shards across 3 nodes for a 300GB product index. Search latency is acceptable at p50 (50ms) but p99 is 2 seconds. What's the most likely cause of the long tail, and how do you investigate?

## Canonical Sources

- Elasticsearch documentation, "Text Analysis" and "Relevance" — practical reference for analysis pipelines and BM25 tuning
- Robertson & Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond" (2009) — the BM25 paper
- Doug Turnbull & John Berryman, *Relevant Search* — the best book on search relevance engineering
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 3 covers full-text indexing briefly