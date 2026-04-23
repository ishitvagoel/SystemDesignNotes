## Concept Map

```mermaid
graph TD
    subgraph "External"
        User -->|Anycast| LB[Load Balancer]
        LB -->|TLS 1.3| GW[API Gateway]
    end

    subgraph "Logic Layer"
        GW -->|mTLS| App[App Service]
        App -->|Saga| App
        App -->|Idempotency| App
    end

    subgraph "Data & Coordination"
        App -->|WAL| DB[(Postgres / LSM)]
        App -->|Raft| Coord[etcd / ZK]
        App -->|Vector| VDB[(Pinecone / pgvector)]
    end

    subgraph "Operations"
        App -->|SLO/SLI| Obs[Observability]
        Obs -->|Error Budget| Obs
    end

    style App fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style DB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

# Core Terms

Core terms used across this vault. For deeper treatment, follow the backlink to the relevant note.

**ANN** — Approximate Nearest Neighbor. Algorithms (HNSW, IVF) that find similar vectors without exact brute-force search. See [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]].

**ACID** — Atomicity, Consistency, Isolation, Durability. The four guarantees of a database transaction.

**Anycast** — Routing technique where multiple servers share one IP address; network routes to the nearest. See [[01-Phase-1-Foundations__Module-01-Networking__Anycast_and_GeoDNS]].

**Back-pressure** — Signal from a consumer to a producer to slow down. See [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Resilience_Patterns]].

**BM25** — Best Matching 25. The standard ranking algorithm for keyword-based full-text search. See [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Full-Text_Search_Architecture]].

**Bounded context** — A boundary within which a domain model is defined. The primary tool for service decomposition. See [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Service_Decomposition_and_Bounded_Contexts]].

**CAP theorem** — A distributed system can provide at most two of: Consistency, Availability, Partition tolerance. See [[02-Phase-2-Distribution__Module-08-Consistency-Models__CAP_Theorem_and_PACELC]].

**CDC** — Change Data Capture. Reading the database WAL to emit change events. See [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]], [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]].

**Cell architecture** — Partitioning infrastructure into independent cells for blast radius isolation. See [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Cell-Based_Architecture]].

**Circuit breaker** — Pattern that stops calling a failing dependency, preventing cascading failure. See [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Resilience_Patterns]].

**CRDT** — Conflict-free Replicated Data Type. Data structures that merge without conflicts. See [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__CRDTs]].

**Consistent hashing** — Hash ring algorithm that minimizes key redistribution when nodes change. Referenced in [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]], [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Distributed_Caching]].

**Envelope encryption** — Encrypt data with a DEK, encrypt the DEK with a KEK in KMS. See [[03-Phase-3-Architecture-Operations__Module-15-Security__Encryption_at_Rest_and_in_Transit]].

**Error budget** — 1 minus SLO. The allowed amount of unreliability. See [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__SLOs_SLIs_and_Error_Budgets]].

**Fencing token** — Monotonically increasing token that prevents stale lock holders from performing actions. See [[02-Phase-2-Distribution__Module-09-Consensus__Distributed_Locks_and_Fencing]].

**FLP impossibility** — Deterministic consensus is impossible in asynchronous systems with one crash failure. See [[02-Phase-2-Distribution__Module-09-Consensus__FLP_Impossibility]].

**HNSW** — Hierarchical Navigable Small World. The dominant ANN index algorithm. See [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]].

**HLC** — Hybrid Logical Clock. Combines physical time with logical ordering. See [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]].

**Idempotency** — Property where performing an operation multiple times has the same effect as once. See [[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]], [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Idempotent_Consumers]].

**KV cache** — Key-Value cache in transformer inference storing attention state. See [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Inference_Serving_Architecture]].

**Linearizability** — Strongest consistency model: every operation appears atomic and ordered by real time. See [[02-Phase-2-Distribution__Module-08-Consistency-Models__Consistency_Spectrum]].

**LSM-tree** — Log-Structured Merge Tree. Write-optimized storage engine. See [[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]].

**mTLS** — Mutual TLS. Both client and server present certificates. See [[03-Phase-3-Architecture-Operations__Module-15-Security__TLS_and_Certificate_Management]].

**MVCC** — Multi-Version Concurrency Control. Readers see a snapshot; writers create new versions. See [[01-Phase-1-Foundations__Module-03-Storage-Engines__MVCC_Deep_Dive]].

**Outbox pattern** — Write events to a database table in the same transaction as business data; relay asynchronously. See [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]].

**PACELC** — Extension of CAP: during Partition choose A/C; Else choose L/C. See [[02-Phase-2-Distribution__Module-08-Consistency-Models__CAP_Theorem_and_PACELC]].

**PagedAttention** — Memory management for LLM KV cache using non-contiguous pages. See [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Inference_Serving_Architecture]].

**RAG** — Retrieval-Augmented Generation. Retrieving context from a knowledge base to ground LLM responses. See [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__RAG_Architecture]].

**Raft** — Consensus algorithm for replicated state machines. See [[02-Phase-2-Distribution__Module-09-Consensus__Consensus_and_Raft]].

**RRF** — Reciprocal Rank Fusion. Method for combining ranked results from different retrieval systems. See [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]].

**Saga** — A sequence of local transactions with compensating transactions for rollback. See [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern]].

**SBOM** — Software Bill of Materials. Inventory of all components in software. See [[03-Phase-3-Architecture-Operations__Module-15-Security__Software_Supply_Chain_Security]].

**SLO/SLI** — Service Level Objective / Indicator. Measurable reliability targets. See [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__SLOs_SLIs_and_Error_Budgets]].

**Snowflake ID** — 64-bit time-sorted distributed ID format. See [[01-Phase-1-Foundations__Module-07-ID-Generation__ID_Generation_Strategies]].

**SPIFFE** — Secure Production Identity Framework For Everyone. Standard for service identity. See [[03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization]].

**Vector clock** — Per-node counter vector that tracks causal ordering and detects concurrency. See [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]].

**WAL** — Write-Ahead Log. Durability mechanism: log changes before modifying data. See [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]].

**2PC** — Two-Phase Commit. Protocol for atomic commit across multiple participants. See [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Two-Phase_Commit]].

## Why This Exists

This glossary serves as the canonical reference for the vocabulary used throughout the System Design Vault. It ensures consistent terminology and provides quick definitions for core concepts without needing to dive deep into a specific module.

## Reflection Prompts

1. Which of these terms were you unfamiliar with before starting?
2. Can you define "Idempotency" and "Linearizability" in your own words?
