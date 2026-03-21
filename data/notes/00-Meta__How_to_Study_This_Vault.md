# How to Study This Vault

## Recommended 20-Week Study Plan

This vault is designed for one module per week, with capstones spread across the final weeks. Adjust pace to your schedule — there's no penalty for going slower.

### Phase 1: Foundations (Weeks 1–7)
| Week | Module | Focus |
|------|--------|-------|
| 1 | M1: Networking | DNS, TCP, HTTP, load balancing |
| 2 | M2: API Design | REST, versioning, rate limiting, idempotency |
| 3 | M3: Storage Engines | B-tree vs LSM, WAL, MVCC, buffer pool |
| 4 | M4: Databases | SQL vs NoSQL, indexing, replication, sharding |
| 5 | M5: Data Modeling | Relational modeling, schema evolution, migrations |
| 6 | M6: Caching & CDN | Cache patterns, Redis, CDN architecture |
| 7 | M7: ID Generation | UUID/Snowflake, Lamport/vector clocks |

### Phase 2: Distribution (Weeks 8–11)
| Week | Module | Focus |
|------|--------|-------|
| 8 | M8: Consistency | Linearizability, CAP/PACELC, session guarantees |
| 9 | M9: Consensus | Raft, Paxos, ZooKeeper/etcd, distributed locks |
| 10 | M10: Distributed TX | 2PC, sagas, outbox, idempotent consumers |
| 11 | M11: Replication | Failover, conflict resolution, CRDTs |

### Phase 3: Architecture & Operations (Weeks 12–17)
| Week | Module | Focus |
|------|--------|-------|
| 12 | M12: Architecture | Monolith vs microservices, event sourcing, cell architecture |
| 13 | M13: Messaging | Kafka vs RabbitMQ, EDA, stream processing, data pipelines |
| 14 | M14: Search + M15: Security | Full-text + vector search, TLS, auth, supply chain |
| 15 | M16: Reliability | SLOs, resilience patterns, chaos engineering |
| 16 | M17: Observability + M18: Multi-Tenancy | Monitoring, deployment, geo-distribution, cost |
| 17 | Capstones 1–2 | URL Shortener, News Feed |

### Phase 4: Modern & Capstones (Weeks 18–20)
| Week | Module | Focus |
|------|--------|-------|
| 18 | M19: AI Inference + M20: RAG/Agents | LLM serving, RAG, agentic systems |
| 19 | M21: Serverless/Platform + Capstone 3 | Edge compute, K8s, Payments design |
| 20 | Capstones 4–6 | Collaborative Editor, AI Search, Multi-Region E-Commerce |

## How to Use Each Note

1. **Read the "Why This Exists" section first.** This grounds the concept in a real problem.
2. **Study the mental model.** Can you explain it to a non-engineer?
3. **Work through the technical explanation.** Draw your own diagrams.
4. **Internalize the trade-offs.** Every concept has trade-offs — if you can only remember one thing, remember the trade-off table.
5. **Answer the reflection prompts.** These are design review questions. Try to answer before reading the answer (which you can generate by working through the vault's connected notes).
6. **Follow the backlinks.** The vault's power is in the connections between concepts. When a note references [[Consistent Hashing]], open that note and understand the connection.

## Mastery Signals

You understand a concept when you can:
- Explain *why* it exists (the problem it solves) without looking at notes
- Describe the trade-offs from memory
- Identify which pattern to use in a new scenario you haven't seen before
- Explain why an alternative pattern would be worse for that specific scenario