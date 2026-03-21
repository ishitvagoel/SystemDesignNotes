# Glossary

Core terms used across this vault. For deeper treatment, follow the backlink to the relevant note.

**ANN** — Approximate Nearest Neighbor. Algorithms (HNSW, IVF) that find similar vectors without exact brute-force search. See [[Vector Search and Hybrid Retrieval]].

**ACID** — Atomicity, Consistency, Isolation, Durability. The four guarantees of a database transaction.

**Anycast** — Routing technique where multiple servers share one IP address; network routes to the nearest. See [[Anycast and GeoDNS]].

**Back-pressure** — Signal from a consumer to a producer to slow down. See [[Resilience Patterns]].

**BM25** — Best Matching 25. The standard ranking algorithm for keyword-based full-text search. See [[Full-Text Search Architecture]].

**Bounded context** — A boundary within which a domain model is defined. The primary tool for service decomposition. See [[Service Decomposition and Bounded Contexts]].

**CAP theorem** — A distributed system can provide at most two of: Consistency, Availability, Partition tolerance. See [[CAP Theorem and PACELC]].

**CDC** — Change Data Capture. Reading the database WAL to emit change events. See [[Write-Ahead Log]], [[Outbox Pattern]].

**Cell architecture** — Partitioning infrastructure into independent cells for blast radius isolation. See [[Cell-Based Architecture]].

**Circuit breaker** — Pattern that stops calling a failing dependency, preventing cascading failure. See [[Resilience Patterns]].

**CRDT** — Conflict-free Replicated Data Type. Data structures that merge without conflicts. See [[CRDTs]].

**Consistent hashing** — Hash ring algorithm that minimizes key redistribution when nodes change. Referenced in [[Load Balancing Fundamentals]], [[Distributed Caching]].

**Envelope encryption** — Encrypt data with a DEK, encrypt the DEK with a KEK in KMS. See [[Encryption at Rest and in Transit]].

**Error budget** — 1 minus SLO. The allowed amount of unreliability. See [[SLOs SLIs and Error Budgets]].

**Fencing token** — Monotonically increasing token that prevents stale lock holders from performing actions. See [[Distributed Locks and Fencing]].

**FLP impossibility** — Deterministic consensus is impossible in asynchronous systems with one crash failure. See [[FLP Impossibility]].

**HNSW** — Hierarchical Navigable Small World. The dominant ANN index algorithm. See [[Vector Search and Hybrid Retrieval]].

**HLC** — Hybrid Logical Clock. Combines physical time with logical ordering. See [[Logical Clocks and Ordering]].

**Idempotency** — Property where performing an operation multiple times has the same effect as once. See [[Idempotency]], [[Idempotent Consumers]].

**KV cache** — Key-Value cache in transformer inference storing attention state. See [[Inference Serving Architecture]].

**Linearizability** — Strongest consistency model: every operation appears atomic and ordered by real time. See [[Consistency Spectrum]].

**LSM-tree** — Log-Structured Merge Tree. Write-optimized storage engine. See [[B-Tree vs LSM-Tree]].

**mTLS** — Mutual TLS. Both client and server present certificates. See [[TLS and Certificate Management]].

**MVCC** — Multi-Version Concurrency Control. Readers see a snapshot; writers create new versions. See [[MVCC Deep Dive]].

**Outbox pattern** — Write events to a database table in the same transaction as business data; relay asynchronously. See [[Outbox Pattern]].

**PACELC** — Extension of CAP: during Partition choose A/C; Else choose L/C. See [[CAP Theorem and PACELC]].

**PagedAttention** — Memory management for LLM KV cache using non-contiguous pages. See [[Inference Serving Architecture]].

**RAG** — Retrieval-Augmented Generation. Retrieving context from a knowledge base to ground LLM responses. See [[RAG Architecture]].

**Raft** — Consensus algorithm for replicated state machines. See [[Consensus and Raft]].

**RRF** — Reciprocal Rank Fusion. Method for combining ranked results from different retrieval systems. See [[Vector Search and Hybrid Retrieval]].

**Saga** — A sequence of local transactions with compensating transactions for rollback. See [[Saga Pattern]].

**SBOM** — Software Bill of Materials. Inventory of all components in software. See [[Software Supply Chain Security]].

**SLO/SLI** — Service Level Objective / Indicator. Measurable reliability targets. See [[SLOs SLIs and Error Budgets]].

**Snowflake ID** — 64-bit time-sorted distributed ID format. See [[ID Generation Strategies]].

**SPIFFE** — Secure Production Identity Framework For Everyone. Standard for service identity. See [[Authentication and Authorization]].

**Vector clock** — Per-node counter vector that tracks causal ordering and detects concurrency. See [[Logical Clocks and Ordering]].

**WAL** — Write-Ahead Log. Durability mechanism: log changes before modifying data. See [[Write-Ahead Log]].

**2PC** — Two-Phase Commit. Protocol for atomic commit across multiple participants. See [[Two-Phase Commit]].