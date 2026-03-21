# What Changed Since DDIA

*Designing Data-Intensive Applications* was published in 2017. This living note tracks major shifts since then that update, extend, or sometimes contradict DDIA's coverage.

## Consensus & Coordination

**DDIA coverage**: ZooKeeper as the primary coordination service. Raft described but etcd not prominent.

**What changed**: etcd became the dominant coordination service (Kubernetes made it ubiquitous). Kafka removed its ZooKeeper dependency (KRaft mode, GA in 2023). Raft is now the default consensus algorithm for new systems; Paxos is legacy. CockroachDB and TiDB brought Multi-Raft to production scale.

## Distributed Databases

**DDIA coverage**: Spanner was new and Google-only. CockroachDB and TiDB were early.

**What changed**: CockroachDB is production-mature (used by DoorDash, Netflix). TiDB is widely adopted (ByteDance, PingCAP customers). Managed distributed SQL (CockroachDB Cloud, Spanner as a GCP service) is mainstream. The "NewSQL" category is no longer novel — it's a standard option. PlanetScale (Vitess-based) brought managed MySQL sharding to the mainstream.

## Stream Processing

**DDIA coverage**: Kafka Streams, Flink, and Spark Structured Streaming were all emerging.

**What changed**: Flink became the de facto standard for stateful stream processing. Kafka Streams gained traction for simpler use cases (embedded in applications). The Lambda architecture largely gave way to the Kappa architecture or unified batch+stream frameworks (Flink handles both). Apache Iceberg, Delta Lake, and Hudi created the "lakehouse" category — bridging data lakes and warehouses with ACID on object storage.

## Consistency

**DDIA coverage**: Excellent treatment of consistency models, CAP critique.

**What changed**: S3 became strongly consistent (December 2020) — a major shift from DDIA's description of eventual consistency for overwrites. This eliminated an entire class of S3-related bugs. MongoDB added causal consistency sessions (v3.6+). DynamoDB added transactions (2018). The industry trend is toward stronger consistency defaults, not weaker.

## AI/ML Infrastructure (Entirely New)

**DDIA coverage**: Not covered — predates the LLM era.

**What changed**: LLM inference serving became a first-class distributed systems problem. PagedAttention/vLLM (2023) revolutionized GPU memory management. RAG became the standard pattern for grounding LLMs in domain knowledge. Vector databases emerged as a category (Pinecone, Milvus, Weaviate). Semantic caching, model routing, and AI gateways are new infrastructure patterns. Agent architectures (ReAct, MCP, A2A) are creating new distributed coordination challenges.

## Edge Computing (Mostly New)

**DDIA coverage**: CDNs covered as caching; edge compute not discussed.

**What changed**: Cloudflare Workers (V8 isolates at the edge) and similar platforms enabled computation at CDN PoPs — not just caching. WebAssembly matured as a server-side runtime (Wasm 3.0 standardized September 2025, WASI 0.2). Edge-origin architecture became a standard pattern for web applications.

## Observability

**DDIA coverage**: Minimal.

**What changed**: OpenTelemetry became the standard for instrumentation (merged OpenTracing + OpenCensus). eBPF-powered observability enables zero-instrumentation tracing at the kernel level. SLO-based alerting (multi-window burn rates) replaced threshold-based alerting as best practice. "Observability engineering" became a recognized discipline.

## Security

**DDIA coverage**: Minimal (encryption, access control briefly mentioned).

**What changed**: Zero-trust architecture moved from concept to practice (BeyondCorp implementations). Software supply chain security became regulatory-mandated (US EO 14028, EU Cyber Resilience Act). SBOMs, SLSA, and Sigstore are now standard. SPIFFE/SPIRE for service identity. mTLS everywhere via service meshes.

## Platform Engineering

**DDIA coverage**: Not covered.

**What changed**: "Platform engineering" emerged as a discipline. Internal Developer Platforms (IDPs) with Backstage developer portals. The "platform as a product" mindset. GitOps (ArgoCD, Flux) as the deployment standard. Cell-based architecture adopted by Amazon, Slack, DoorDash for blast radius isolation.

## Kafka & Coordination (2024–2025)

**DDIA coverage**: Kafka described with ZooKeeper as the metadata store. KRaft mentioned as future.

**What changed**: Apache Kafka 4.0 (released March 2025) completely removed ZooKeeper. KRaft — Kafka's internal Raft-based metadata system — is now the only way to run Kafka. Kafka 3.9 (November 2024) was the final version to support ZooKeeper and serves as the "bridge release" for migration. The removal eliminates the need to deploy and manage a separate distributed system alongside Kafka, simplifies operations, and enables faster recovery (10x faster than ZooKeeper-based clusters). The new consumer group rebalance protocol (KIP-848, GA in 4.0) eliminates stop-the-world rebalances. Kafka now supports up to ~1.9M partitions per cluster under KRaft (vs ~200K practical limit with ZooKeeper).

## Reasoning Models & LLM Architecture (2024–2026)

**DDIA coverage**: Not covered — predates the LLM era.

**What changed**: OpenAI's o1 (September 2024) and o3 (early 2025) introduced "reasoning models" — LLMs that use chain-of-thought at inference time, spending more compute per query for dramatically better performance on math, coding, and logic tasks. This created a new serving dimension: reasoning models have unpredictable output length and higher per-query cost, requiring different batching and cost management strategies than standard chat models. Anthropic's Claude (Opus/Sonnet), Google's Gemini, and Meta's Llama 3 further expanded the multi-provider landscape. The Model Context Protocol (MCP, Anthropic, 2024) standardized how LLMs connect to external tools and data sources, and Google's Agent-to-Agent (A2A) protocol (2025) enables inter-agent communication. These protocols are becoming the HTTP of the agentic era.

## LLM Inference Serving (2024–2026)

**DDIA coverage**: Not covered.

**What changed**: vLLM matured into the dominant open-source serving framework, with PagedAttention becoming the standard for KV cache management. SGLang emerged as a high-performance alternative, now deployed on 400K+ GPUs worldwide with RadixAttention for prefix caching and a zero-overhead CPU scheduler. Speculative decoding moved from research to production standard — EAGLE-3 achieves up to 4.8x speedup, and is natively supported in vLLM, SGLang, and TensorRT-LLM. Prefill-decode disaggregation (running prompt processing and token generation on separate GPU pools) became an architectural pattern for large-scale serving. NVIDIA's B200/Blackwell GPUs brought FP4 support and significantly higher memory bandwidth.

## RAG & Retrieval (2024–2026)

**DDIA coverage**: Not covered.

**What changed**: Microsoft's GraphRAG (open-sourced mid-2024) demonstrated that combining knowledge graphs with retrieval significantly improves summarization and multi-hop reasoning over pure vector search. ColBERT-style late interaction models (ColBERTv2, ColPali for multimodal, ColQwen) gained adoption — they represent documents as multi-vector embeddings for token-level matching, achieving higher precision than single-vector dense retrieval while remaining efficient. Jina AI's "Late Chunking" places the chunking step after embedding (embedding the full document first, then splitting), better preserving cross-chunk context. Contextual embeddings from Anthropic and others embed chunks with document-level context, reducing the "lost context at chunk boundary" problem. The RAG ecosystem consolidated around hybrid retrieval (BM25 + dense vectors) with cross-encoder re-ranking as the production standard.

## Vector Database Consolidation

**DDIA coverage**: Not covered.

**What changed**: The "vector database wars" of 2023 settled by 2025. pgvector matured significantly — with HNSW index support (pgvector 0.5+), it became viable for production vector search within PostgreSQL, eliminating the need for a separate vector database for many use cases. Pinecone launched a serverless architecture reducing costs. Purpose-built vector databases (Weaviate, Qdrant, Milvus) differentiated on features like multi-tenancy, hybrid search, and filtering. The trend: most teams start with pgvector (it's already in their Postgres) and move to a dedicated vector DB only when scale or feature requirements demand it.

## Post-Quantum Cryptography & Supply Chain Security

**DDIA coverage**: Minimal security coverage.

**What changed**: NIST finalized post-quantum cryptography standards in August 2024 (ML-KEM for key encapsulation, ML-DSA for digital signatures), starting the industry transition timeline. Major cloud providers began offering PQC-ready TLS endpoints. The xz Utils backdoor (March 2024) — where a sophisticated attacker spent years gaining maintainer trust to insert a backdoor into a critical Linux compression library — became the canonical example of supply chain attacks and accelerated adoption of SLSA, Sigstore, and reproducible builds. Passkeys (FIDO2/WebAuthn) reached mainstream adoption, supported by Apple, Google, and Microsoft, offering phishing-resistant authentication that eliminates passwords entirely.

---

> This note should be updated as new editions of DDIA are published and as the field continues to evolve. Kleppmann has discussed a second edition — when released, this note should be reconciled against it.
