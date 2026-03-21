# Vector Search and Hybrid Retrieval

## Why This Exists

Keyword search (BM25) finds documents containing the query terms. But "What's the best way to reduce latency?" won't match a document about "optimizing response time" — different words, same meaning. **Vector search** encodes text (or images, audio) as high-dimensional vectors (embeddings) where semantic similarity corresponds to geometric proximity. Similar concepts are nearby in vector space, regardless of exact wording.

This is the retrieval mechanism behind RAG (Retrieval-Augmented Generation), semantic search, recommendation systems, and image similarity.


## Mental Model

Keyword search finds what you said; vector search finds what you meant. Imagine a library where books are shelved by topic coordinates in a 3D room. A cookbook about Italian pasta sits near other Italian cookbooks (close in "cuisine" dimension) and near other pasta books (close in "ingredient" dimension). When you search "easy weeknight dinner ideas," keyword search looks for those exact words in book titles. Vector search converts your query into a point in the 3D room and finds the books closest to that point — which might include "30-Minute Mediterranean Meals" even though it shares no words with your query. Hybrid search does both and merges the results, getting the precision of keywords and the understanding of vectors.

## How It Works

### Embeddings

An embedding model (OpenAI's text-embedding-3, Cohere Embed, open-source models like E5, GTE) converts text into a fixed-size vector (typically 768–3072 dimensions). Semantically similar texts produce vectors that are close together (measured by cosine similarity or dot product).

### Approximate Nearest Neighbor (ANN) Search

Exact nearest neighbor search (brute force: compute distance to every vector) is O(N) — impractical at scale. ANN algorithms trade a small accuracy loss for dramatic speed improvement.

**HNSW (Hierarchical Navigable Small World)**: The dominant ANN algorithm. Builds a multi-layer graph where each layer is a "small world" network. Search starts at the top layer (sparse, long-range connections) and greedily descends to lower layers (dense, short-range connections), narrowing in on the nearest neighbors.

- **Build time**: O(N log N)
- **Query time**: O(log N)
- **Memory**: O(N × dimensions) — the full vectors must be in memory (or accessible quickly)
- **Recall**: Typically 95–99% at practical settings (tunable via `ef_search` parameter)

**Product Quantization (PQ)**: Compresses vectors to reduce memory. Splits each vector into sub-vectors and quantizes each to a codebook entry. Reduces memory by 4–32× at the cost of some recall. Used when the dataset is too large to fit full vectors in memory.

**IVF-PQ (Inverted File + Product Quantization)**: Clusters vectors into partitions (IVF). At query time, searches only the nearest partitions. Combined with PQ for memory efficiency. Good for billion-scale datasets.

### Vector Database Landscape

| Database | Architecture | Strengths | Considerations |
|----------|-------------|-----------|----------------|
| **pgvector** (Postgres extension) | Embedded in Postgres | No new infrastructure, SQL, joins with relational data | Lower performance at scale, limited index types (HNSW added in 0.5.0) |
| **Milvus** | Distributed, purpose-built | High throughput, GPU acceleration, cloud-native | Operational complexity, separate infrastructure |
| **Pinecone** | Managed SaaS | Zero ops, simple API, fast to start | Vendor lock-in, cost at scale, limited configurability |
| **Weaviate** | Purpose-built, hybrid | Built-in BM25+vector hybrid, GraphQL API | Newer, smaller community |
| **Qdrant** | Purpose-built, Rust | High performance, filtering during search, simple API | Newer ecosystem |
| **Elasticsearch/OpenSearch** | kNN plugin | Existing infrastructure, hybrid search native | Not optimized for pure vector workloads |

**Guidance**: Start with pgvector if your dataset is < 5M vectors and you already run Postgres. Move to a purpose-built vector database when you need higher throughput, larger scale, or advanced features (filtered search, GPU acceleration).

## Hybrid Search: Keyword + Vector

Neither keyword search nor vector search is universally better. Keywords excel at exact matches (product names, error codes, proper nouns). Vectors excel at semantic matching (concepts, paraphrases, related ideas). **Hybrid search** combines both for the best of both worlds.

### Reciprocal Rank Fusion (RRF)

The standard method for combining ranked results from different retrieval methods:

```
RRF_score(doc) = Σ 1 / (k + rank_i(doc))
```

Where `rank_i(doc)` is the document's rank in the i-th retrieval method and `k` is a constant (typically 60). Documents ranked highly by multiple methods get the highest combined scores.

**Why RRF works**: It's score-agnostic — it combines ranks, not raw scores (which are incomparable across methods). It naturally balances methods without tuning weights.

### Re-Ranking

A two-stage retrieval pattern: (1) cheaply retrieve a large candidate set (BM25 + vector, top 100), then (2) re-rank using an expensive but accurate model (a cross-encoder that jointly encodes query + document).

Re-ranking is the standard pattern in production search and RAG — the initial retrieval casts a wide net, the re-ranker narrows to the best results.

## Trade-Off Analysis

| Index Type | Recall | Query Latency | Memory Usage | Build Time | Best For |
|-----------|--------|-------------|-------------|-----------|----------|
| Flat (brute-force) | Perfect (100%) | O(N) — slow for large datasets | O(N×D) | Instant | Small datasets (<100K), ground truth testing |
| IVF (inverted file index) | High (95-99% with enough probes) | Fast — probes subset of clusters | Moderate — centroids + postings | Medium | Medium datasets, good recall/speed balance |
| HNSW (Hierarchical NSW) | Very high (>99%) | Very fast — graph traversal | High — graph structure in memory | Slow | Production search needing high recall + low latency |
| PQ (Product Quantization) | Moderate (85-95%) | Very fast — compressed vectors | Very low — compressed representations | Slow | Billion-scale search with memory constraints |
| ScaNN (Google) | High | Very fast | Moderate | Medium | Large-scale retrieval with asymmetric hashing |

| Retrieval Strategy | Precision | Recall | Complexity | Best For |
|-------------------|-----------|--------|------------|----------|
| Keyword only (BM25) | High for exact terms | Low for semantic | Low | Exact matching, known-item search |
| Vector only (dense retrieval) | Moderate | High for semantic | Medium | Semantic search, concept matching |
| Hybrid (keyword + vector, RRF fusion) | High | High | Higher — two retrieval paths | Production RAG, e-commerce search |

**HNSW dominates production vector search for a reason**: It offers the best recall-latency trade-off for datasets up to ~100M vectors that fit in memory. The trade-off is memory: HNSW indexes are large (graph pointers + vectors). For billion-scale search on a budget, consider PQ or IVF+PQ. For most RAG applications with <10M chunks, HNSW is the default choice.

## Failure Modes

**Embedding model mismatch**: Documents are embedded with model A, but queries are embedded with model B (after an upgrade). The embedding spaces are incompatible — cosine similarity produces meaningless results. All retrieved chunks are irrelevant. Solution: re-embed all documents when changing the embedding model, version your indexes by model, and automate re-embedding as part of model upgrade pipelines.

**Stale embeddings after document update**: A document is updated but its embedding isn't regenerated. The vector index returns the document for queries matching the old content, not the new. Solution: trigger re-embedding on document update via CDC or update hooks, and periodically audit for stale embeddings.

**Index recall degradation at scale**: An HNSW index performs well at 1M vectors but degrades to 85% recall at 100M vectors with the same parameters. Queries miss relevant results. Solution: tune HNSW parameters (`ef_construction`, `M`) for the target dataset size, benchmark recall at production scale (not dev-scale), and monitor recall metrics using a held-out evaluation set.

**Dimensionality mismatch causing silent errors**: An embedding model produces 1536-dimensional vectors, but the index is configured for 768 dimensions. Depending on the library, this either crashes, truncates silently, or pads with zeros — all producing wrong results. Solution: validate embedding dimensionality at ingestion time, encode the expected dimensionality in the index metadata, and catch dimension mismatches early.

**Hybrid retrieval fusion score calibration**: BM25 scores and vector similarity scores are on different scales. Naive score combination (add them) over-weights one retrieval method. Reciprocal Rank Fusion (RRF) is more robust but can still produce poor results if one method returns entirely irrelevant results (its top-ranked results drag down fusion quality). Solution: use RRF or learned score fusion, tune the weighting based on evaluation metrics, and filter out low-confidence results from each method before fusion.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Ingestion Path"
        Doc[Document Chunk] --> Model[Embedding Model]
        Model --> Vector[1536-dim Vector]
        Vector --> VDB[(Vector DB: pgvector/Pinecone)]
    end

    subgraph "Hybrid Query Path"
        Query[User Query] --> Embed[Embed Query]
        Query --> Keyword[Extract Keywords]
        
        Embed -->|k-NN| VectorSearch[Vector Results]
        Keyword -->|BM25| KeywordSearch[Keyword Results]
        
        VectorSearch & KeywordSearch --> Fusion[RRF / Re-ranker]
        Fusion --> TopN[Final Top N]
    end

    style VDB fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Fusion fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Embedding Latency**: Local models (like BERT/E5) take **10ms - 50ms**. Remote APIs (OpenAI) can take **200ms - 500ms**.
- **Memory Usage**: An HNSW index for 1 million vectors (1536 dimensions, float32) requires **~6GB - 8GB of RAM** (vectors + graph pointers).
- **Brute-Force Limit**: Use flat (exact) search for **< 100,000 vectors**. Switch to HNSW/ANN past this point.
- **Chunk Size**: For RAG, the "Sweet Spot" is typically **256 - 512 tokens**. Too small loses context; too large dilutes the embedding signal.

## Real-World Case Studies

- **Instacart (Product Embeddings)**: Instacart uses vector search to power their "Search by Meaning" feature. They embed both user queries and product descriptions into the same vector space. This ensures that a search for "comfort food" can retrieve items like "mac and cheese" even if those words aren't in the product title.
- **Notion (Q&A / RAG)**: Notion uses hybrid search for their AI assistant. They first retrieve candidate blocks using a combination of **BM25** (for exact title/tag matches) and **Vector Search** (for conceptual matching). They then use a cross-encoder model to re-rank the top 50 results to find the most relevant context for the LLM.
- **Spotify (Discovery Weekly)**: Spotify uses vector embeddings not just for text, but for songs and users. By representing every song as a high-dimensional vector based on listening patterns, they can find "nearby" songs to create highly personalized recommendations, effectively using vector search as a global-scale collaborative filtering engine.

## Connections

- [[Full-Text Search Architecture]] — BM25 keyword search, the complement to vector search in hybrid systems
- [[RAG Architecture]] — Vector search is the retrieval backbone of RAG pipelines
- [[Indexing Deep Dive]] — HNSW and IVF are index types, analogous to B-tree and hash indexes for different access patterns

## Reflection Prompts

1. Your RAG system uses a single embedding model (OpenAI `text-embedding-3-small`) for both documents and queries. A user queries "What are the tax implications of exercising stock options?" The top results are about stock market trends and exercise equipment. What's likely going wrong, and how would you diagnose and fix the retrieval quality?

2. You're building a hybrid search system that combines BM25 keyword search and dense vector search using Reciprocal Rank Fusion (RRF). For the query "Python decorator pattern," BM25 returns excellent results (exact keyword match), but vector search returns results about decorative patterns and Python the snake. How should you weight the two retrieval methods, and is a static weighting sufficient?

3. Your vector database has 50 million document chunks embedded with a 1536-dimensional model. Search latency is 200ms, but the product requires <50ms. You're using HNSW indexes. What are your options for reducing latency, and what recall trade-offs does each introduce?

## Canonical Sources

- Malkov & Yashunin, "Efficient and Robust Approximate Nearest Neighbor using Hierarchical Navigable Small World Graphs" (2018) — the HNSW paper
- *System Design Interview* by Alex Xu — proximity service and vector search chapters
- Alex Xu, *Generative AI System Design Interview* (2024) — RAG and vector search architecture
- pgvector documentation — practical reference for vector search in Postgres