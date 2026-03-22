# RAG Architecture

## Why This Exists

LLMs have knowledge cutoff dates and hallucinate when asked about information they don't have. Fine-tuning is expensive, slow, and doesn't solve the freshness problem (you'd need to retrain continuously). RAG (Retrieval-Augmented Generation) takes a different approach: **retrieve relevant documents from a knowledge base at query time and include them in the prompt**. The LLM generates answers grounded in retrieved evidence — reducing hallucination and enabling domain-specific responses without modifying the model.

RAG is an **architectural pattern**, not a single technique. It involves an embedding pipeline, a vector store, a retrieval strategy, a re-ranking step, and an LLM — each is a separate system component with its own scaling characteristics, failure modes, and quality dimensions. The quality of the RAG system is bottlenecked by retrieval quality — if the retriever doesn't find the right documents, the LLM can't generate the right answer, no matter how powerful it is.


## Mental Model

An open-book exam. A plain LLM is a student taking a closed-book test — they can only answer from what they memorized during training (which might be outdated or incomplete). RAG gives the student a reference library: before answering each question, they search the library (vector retrieval), pull out the most relevant pages (context), and use both their knowledge and the reference material to write their answer (generation). The quality of the answer depends on: how well-organized the library is (chunking and indexing), how good the student is at finding the right pages (retrieval and re-ranking), and how well they synthesize the reference material with their own understanding (generation with context). A bad library or bad retrieval defeats the whole purpose.

## How It Works

### The RAG Pipeline

```
User Query → Embed → Retrieve (vector + keyword) → Re-rank → Assemble Context → LLM Generate → Response
```

Each step has trade-offs:

### Step 1: Embedding Pipeline (Offline)

Documents are chunked, embedded, and stored in a vector database before any query arrives. This is the offline indexing phase.

**Chunking strategies** — the most underappreciated quality lever:

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| Fixed-size | Split every N tokens (e.g., 512) | Simple, predictable | Splits mid-sentence, loses context |
| Sentence-based | Split at sentence boundaries | Respects linguistic structure | Variable chunk sizes, some chunks too small |
| Paragraph-based | Split at paragraph breaks | Natural semantic units | Paragraphs vary wildly in length |
| Semantic | Split when embedding similarity between adjacent sentences drops below a threshold | Captures topic transitions | More complex, embedding-dependent |
| Recursive | Split by heading → paragraph → sentence, recursively | Hierarchical, respects document structure | Requires well-structured documents |

**Practical guidance**: Start with recursive chunking (heading → paragraph → sentence), 256–512 tokens per chunk, 50–100 token overlap between consecutive chunks. The overlap prevents information from being lost at chunk boundaries (a sentence spanning two chunks is captured by both). Tune chunk size empirically — smaller chunks improve precision (each chunk is more focused) but hurt recall (the relevant information might be split across chunks).

**Embedding model selection**: Trade-off between quality and cost/latency. OpenAI text-embedding-3-large is high quality ($0.13/M tokens). Open-source models (E5-large-v2, GTE-large, bge-large-en) run locally — zero API cost, lower latency, comparable quality for many domains. For specialized domains (medical, legal), domain-specific embedding models may outperform general-purpose ones.

**Incremental indexing**: When documents are updated, re-embed only changed chunks. Track a content hash per chunk. Compare on re-index — only re-embed chunks whose hash changed. This prevents re-embedding the entire corpus (which could be millions of chunks) on every document update.

### Step 2: Retrieval (Online)

Use [[Vector Search and Hybrid Retrieval|hybrid search]]: run the user's query through both BM25 (keyword) and vector search (semantic) in parallel. BM25 catches exact matches (product names, error codes, acronyms). Vector search catches semantic matches (paraphrases, related concepts).

Merge results using **Reciprocal Rank Fusion (RRF)**: a score-agnostic method that combines ranked lists from different retrieval methods. Documents ranked highly by both methods get the highest combined scores.

### Step 3: Re-Ranking

Take the top 20 results from hybrid retrieval and re-rank with a **cross-encoder** model. A cross-encoder jointly encodes the query and each candidate document, producing a relevance score that's more accurate than embedding similarity (which encodes query and document independently).

**Why re-ranking matters**: Embedding similarity is a coarse signal (it compares vector directions in a high-dimensional space). A cross-encoder can capture fine-grained relevance signals that embedding similarity misses — negation ("NOT related to X"), specificity ("about X in the context of Y"), and recency ("the latest policy on X"). In benchmarks, adding re-ranking improves retrieval quality by 10–30%.

**The latency cost**: 20 cross-encoder inferences add 50–200ms. This is acceptable for search (total latency <500ms) but must be budgeted in the latency budget.

### Step 4: Context Assembly

Select the top 5–8 re-ranked chunks. Assemble into the LLM prompt:

```
System: You are a helpful assistant. Answer based on the provided context. 
If the context doesn't contain the answer, say so.

Context:
[Document: "Employee Handbook v2024", Section: "Vacation Policy"]
Full-time employees receive 20 days of paid vacation per year...

[Document: "HR FAQ", Section: "Carry-Over"]
Unused vacation days can be carried over up to a maximum of 5 days...

User: How many vacation days do I get, and can I carry them over?
```

Include metadata (document title, section, date) so the LLM can cite sources. Instruct the LLM to ground its answer in the provided context — this reduces hallucination (the LLM has relevant evidence to draw from rather than relying on parametric knowledge).

## Advanced Retrieval Techniques (2024–2026)

### GraphRAG

Microsoft's GraphRAG (open-sourced 2024) augments traditional RAG with knowledge graphs. Instead of relying solely on vector similarity, GraphRAG extracts entities and relationships from documents into a graph structure, then uses community detection and graph traversal to answer queries that require synthesizing information across multiple documents.

**When it helps**: Multi-hop reasoning ("What companies in our portfolio are affected by the new EU regulation?"), global summarization ("What are the main themes across all 500 customer support tickets?"), and queries requiring entity-relationship understanding. Standard vector RAG struggles with these because the answer spans multiple chunks that aren't individually similar to the query.

**Trade-off**: GraphRAG requires an expensive indexing step (LLM-powered entity extraction), producing significantly larger indexes. The quality of the graph depends heavily on the extraction quality. Best used as a complement to vector RAG, not a replacement — route queries to GraphRAG when they require cross-document synthesis.

### Late Interaction Models (ColBERT, ColPali, ColQwen)

Traditional dense retrieval encodes documents into a single vector — compressing all semantic information into one point. Late interaction models (ColBERT family) keep per-token embeddings for both queries and documents, computing relevance via a MaxSim operation across all token pairs.

**Why this matters for RAG**: ColBERT-style retrieval captures fine-grained semantic matches that single-vector models miss — negation, specificity, and multi-aspect queries. ColBERTv2 reduces storage overhead via residual compression. ColPali and ColQwen extend this to multimodal documents — they treat entire PDF pages as images, eliminating the need for OCR and complex document parsing pipelines.

**Practical adoption**: RAGatouille makes ColBERT easy to integrate into Python RAG pipelines. Jina-ColBERT-v2 provides multilingual support. The RAGatouille + Weaviate integration enables production deployment. Late interaction is increasingly used as a re-ranking stage rather than the primary retriever, combining the recall of dense vectors with the precision of token-level matching.

### Late Chunking (Jina AI, 2024)

Traditional chunking splits text first, then embeds each chunk independently — losing cross-chunk context. Late chunking inverts this: embed the full document first (using a long-context embedding model), then split into chunks at the embedding level. Each chunk's embedding retains awareness of the surrounding document context.

**Impact**: Reduces the "lost context at chunk boundary" problem that causes retrieval misses. Particularly effective for technical documents where a paragraph's meaning depends on preceding sections. Requires embedding models that support long contexts (8K+ tokens).

### Contextual Embeddings

Embed each chunk with a brief document-level summary prepended: "This chunk is from [document title], section [X], which discusses [Y]." The embedding model encodes the chunk with this contextual header, producing embeddings that are document-aware even when retrieved independently.

**Impact**: A simple technique that significantly improves retrieval precision for ambiguous chunks. A chunk saying "the policy allows 20 days" is meaningless without context — prepending "From: Employee Handbook, Section: Vacation Policy" disambiguates it for the embedding model.

## Enterprise RAG Patterns

**Federated retrieval**: Multiple knowledge bases (internal docs, databases, APIs, wikis). Route the query to relevant sources, retrieve from each, merge. A question about "quarterly revenue" hits the SQL database. A question about "vacation policy" hits the document index. A routing classifier determines which sources to query.

**Tiered retrieval** (cost optimization): Cheap filter (metadata filter + BM25, <10ms) → medium-cost retrieval (vector search, ~50ms) → expensive re-rank (cross-encoder, ~150ms). Each stage reduces the candidate set, keeping total cost manageable. At 1M queries/day, skipping re-ranking for simple queries (where BM25 alone gives high-confidence results) can save significant compute.

**Streaming/real-time RAG**: For knowledge bases that change frequently (support tickets, news, live dashboards), use [[Event-Driven Architecture Patterns|CDC]] to keep the vector index updated in near-real-time. Database change → embedding pipeline → vector store update, all within minutes.

## Evaluation

RAG evaluation is multi-dimensional — you must evaluate retrieval quality AND generation quality independently:

**Retrieval metrics**:
- **Recall@k**: What fraction of relevant documents are in the top k? (Are you finding the right documents?)
- **MRR (Mean Reciprocal Rank)**: How high is the first relevant document? (Is the best answer near the top?)
- **NDCG (Normalized Discounted Cumulative Gain)**: Are higher-ranked results more relevant? (Is the ranking good?)

**Generation metrics**:
- **Faithfulness**: Is the answer supported by the retrieved context? (Not hallucinated?)
- **Answer relevance**: Does the answer actually address the question?
- **Context relevance**: Are the retrieved chunks relevant to the question? (Garbage in → garbage out)

**Automated evaluation frameworks**: RAGAS (Retrieval Augmented Generation Assessment) automates these metrics using an LLM judge. Run RAGAS on a test set to compare pipeline configurations (different chunking sizes, different embedding models, with/without re-ranking).

**Hallucination detection**: Compare the generated answer against the retrieved context. Claims not supported by any context chunk are potential hallucinations. This can be automated with a judge LLM: "Given this context and this answer, identify any claims not supported by the context."

## Trade-Off Analysis

| Retrieval Strategy | Precision | Recall | Latency | Complexity | Best For |
|-------------------|-----------|--------|---------|------------|----------|
| Naive RAG (embed → retrieve → generate) | Moderate | Moderate | Low | Low | Prototypes, small knowledge bases |
| Hybrid retrieval (BM25 + dense vectors) | High | High | Moderate | Medium | Production RAG, e-commerce, documentation |
| HyDE (Hypothetical Document Embeddings) | Higher — query expansion | Higher | Higher — extra LLM call | Medium | Queries that differ in style from documents |
| Agentic RAG (query planning + multi-hop) | Highest | Highest | High — multiple LLM + retrieval calls | High | Complex questions requiring reasoning across docs |
| Graph RAG (knowledge graph + retrieval) | High for entity relations | Moderate | Moderate | High | Structured knowledge, entity-centric queries |

| Chunking Strategy | Retrieval Quality | Context Preservation | Index Size | Best For |
|------------------|------------------|---------------------|-----------|----------|
| Fixed-size chunks (512 tokens) | Moderate — arbitrary boundaries | Poor — splits mid-sentence | Predictable | Simple implementations, uniform documents |
| Semantic chunking (paragraph/section) | High — meaningful boundaries | Good | Variable | Structured documents, technical docs |
| Recursive/hierarchical chunking | High | Excellent — parent context preserved | Larger | Long documents needing multi-level context |
| Document summary + full doc retrieval | High | Perfect — full document context | Smaller index | Small knowledge bases, long-form documents |

**The 80% of RAG quality comes from chunking and retrieval, not the LLM**: Teams spend most time tweaking prompts when they should be optimizing chunks and retrieval. Poor chunking (splitting mid-paragraph, losing context) causes irrelevant retrieval, which no prompt can fix. Get your chunks semantically meaningful, your embeddings domain-tuned, and your retrieval pipeline hybrid (BM25 + dense) before optimizing the generation prompt.

## Failure Modes

- **Retrieval misses the relevant document**: The most common RAG failure. The answer exists in the knowledge base, but the retriever doesn't find it — maybe the chunking split the relevant paragraph, or the embedding model doesn't capture the semantic relationship. Mitigation: test retrieval independently (evaluate recall@k on a test set), experiment with chunk sizes, and use hybrid search (BM25 catches what embeddings miss).

- **Context window overflow**: Too many retrieved chunks exceed the LLM's context window. Or the chunks are so large that the relevant information is buried in noise. Mitigation: smaller, more focused chunks; dynamic context window management (use fewer chunks for shorter queries); or use models with larger context windows.

- **Stale index**: Documents are updated but the vector index isn't re-embedded. Users get answers based on outdated information. Mitigation: incremental indexing with CDC, monitor index freshness as an SLI.

- **Multi-tenant data leakage**: In a SaaS RAG system, embeddings from tenant A and tenant B reside in the same vector index. A tenant A query about a topic that semantically overlaps with tenant B's documents may retrieve tenant B's context — a data isolation violation. This is not hypothetical: if two customers both have "internal pricing" documents, a vector search for "discount policy" can cross tenant boundaries if there's no namespace filtering. Mitigation: use per-tenant namespaces (Pinecone namespaces, Weaviate multi-tenancy, Qdrant collections) and enforce a metadata filter on every retrieval query (`filter: { tenant_id: "tenant_a" }`). The trade-off: per-tenant namespaces increase index count (operational overhead, potential per-namespace provisioning costs) and disable cross-tenant global search. Test this boundary explicitly as a security test, not just a functional test.

### Production Evaluation Pipeline

The note explains what to measure (RAGAS metrics). Here's how to run it continuously in production so quality regressions are caught before users notice:

**Offline evaluation on a golden test set**: Maintain a curated set of 50–200 question/expected-answer pairs covering your domain. Run this benchmark on every pipeline change (different chunk size, new embedding model, re-ranking enabled/disabled). Track the metrics over time in your CI system — a change that drops faithfulness by 5% should be a CI failure, not a post-deployment discovery.

**Online evaluation via sampling**: In production, a judge LLM evaluates 1–5% of live responses automatically. For each sampled response, the judge checks: "Is this answer faithful to the retrieved context? Is it relevant to the question?" Log the faithfulness score per query and alert when the rolling average drops below threshold (e.g., 90% faithfulness over a 1-hour window).

**Retrieval monitoring (separate from generation)**: Log recall@5 by tracking whether users click "this wasn't helpful" or follow-up with a rephrased version of the same question. A high follow-up rate on a specific query pattern indicates retrieval failure, not generation failure. These signals point to the right layer to fix.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Ingestion (Offline)"
        Doc[Source Docs] --> Chunk[Chunker: 512 tokens]
        Chunk --> Embed[Embedding Model]
        Embed --> VDB[(Vector DB)]
    end

    subgraph "Retrieval (Online)"
        User[Query] --> Q_Embed[Query Embed]
        Q_Embed --> Search[Vector Search]
        User --> Keyword[BM25 Search]
        Search & Keyword --> Fusion[RRF Fusion]
        Fusion --> Rerank[Cross-Encoder Reranker]
    end

    subgraph "Generation"
        Rerank --> Prompt[Assemble Prompt + Context]
        Prompt --> LLM[LLM: GPT-4 / Claude]
        LLM --> Response[Grounded Response]
    end

    style VDB fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Rerank fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **The 80/20 Rule**: 80% of RAG quality is determined by **Retrieval and Chunking**, not the prompt. Focus on getting the right context into the window first.
- **Chunk Overlap**: Use a **10% - 20% overlap** between chunks (e.g., 500 tokens with 50-token overlap) to ensure semantic continuity at boundaries.
- **Retrieval Top-K**: Start with **k=20** for the initial retrieval, then use a re-ranker to narrow down to the **top 5** chunks for the LLM prompt.
- **Cost vs Quality**: Re-ranking the top 20 results typically adds **~100ms - 200ms** of latency but can improve answer accuracy by **15% - 30%**.

## Real-World Case Studies

- **Microsoft (GraphRAG)**: Microsoft developed **GraphRAG** to solve the "Global Summarization" problem. Standard RAG is great at finding a needle in a haystack (local facts), but GraphRAG builds a knowledge graph of the entire corpus first. This allows it to answer high-level questions like "What are the main themes across all 1,000 documents?" by traversing the graph rather than just matching vectors.
- **Intercom (Fin AI)**: Intercom's customer support bot uses RAG to answer tickets. They found that **Formatting Matters**: the LLM performs significantly better when retrieved context is provided as clean Markdown rather than raw text or HTML, as the structural cues help the model distinguish between headings, lists, and body text.
- **Pinecone (Serverless Vector DB)**: Pinecone moved to a serverless architecture to handle the "Spiky Ingestion" problem of RAG. Many companies have static docs that change once a month—paying for a 24/7 provisioned vector database was inefficient. Their serverless model separates storage from compute, allowing companies to store millions of vectors for dollars a month while only paying for search when users actually ask questions.

## Connections

- [[Vector Search and Hybrid Retrieval]] — The retrieval backbone of RAG. That note covers the indexing algorithms (HNSW, IVF, PQ) and vector database selection; this note covers how to use retrieval within a generation pipeline
- [[Full-Text Search Architecture]] — BM25 keyword search in the hybrid retrieval step. That note covers inverted indexes and ranking algorithms; this note covers how BM25 complements dense retrieval in hybrid RAG
- [[Inference Serving Architecture]] — The LLM serving layer that generates responses
- [[AI Gateway and LLM Operations]] — Semantic caching, model routing, and cost management for RAG
- [[Cache Patterns and Strategies]] — Semantic caching can cache RAG responses for repeated similar queries

## Reflection Prompts

1. Your RAG system's users report that it "makes stuff up" about 10% of the time. You check and find that retrieval recall@5 is only 60% — the right document is often not in the top 5 results. What improvements would you try first: better chunking, a better embedding model, adding re-ranking, or switching from pure vector search to hybrid? How do you decide?

2. A customer's knowledge base has 500,000 documents, updated 1,000 times/day. Your current indexing pipeline re-embeds the entire corpus nightly (takes 6 hours). During the day, new and updated documents aren't searchable. Design an incremental indexing architecture that achieves <5 minute freshness.

## Canonical Sources

- Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (2020) — the original RAG paper
- *Generative AI System Design Interview* by Alex Xu (2024) — RAG pipeline architecture chapters
- RAGAS documentation (ragas.io) — the standard RAG evaluation framework
- LlamaIndex and LangChain documentation — the most popular RAG orchestration libraries