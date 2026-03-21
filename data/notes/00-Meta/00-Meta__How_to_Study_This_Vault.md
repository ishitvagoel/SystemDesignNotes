# How to Study This Vault

## The Knowledge Journey

```mermaid
graph LR
    S1[1. Why it exists] --> S2[2. Mental Model]
    S2 --> S3[3. Trade-offs]
    S3 --> S4[4. Connections]
    S4 --> S5[5. Mastery: Can you explain it?]
```

## Recommended 22-Week Study Plan

| Week | Phase | Topic | Modules |
|------|-------|-------|---------|
| 1-2 | Foundations | Networking & DNS | M01 |
| 3-4 | Foundations | API Design & Gateway | M02 |
| 5-6 | Foundations | Storage Engines & DBs | M03, M04 |
| 7-8 | Foundations | Data Modeling & Migrations | M05 |
| 9-10 | Foundations | Caching & ID Gen | M06, M07 |
| 11-12 | Distribution | Consistency & CAP | M08 |
| 13-14 | Distribution | Consensus & Coordination | M09 |
| 15-16 | Distribution | Trans. & Replication | M10, M11 |
| 17-18 | Architecture | Patterns & Messaging | M12, M13 |
| 19-20 | Architecture | Search, Security & Rel. | M14, M15, M16 |
| 21 | Architecture | Obs., Multi-Tenancy & Cost | M17, M18 |
| 22 | Modern AI | AI Inf., RAG & Serverless | M19, M20, M21 |
| 23 | Operations | FinOps & Privacy | M22, M23 |
| 24 | Capstones | Design Drill Down | Capstones |

## Module Prerequisites

Some modules build on concepts from earlier modules. Use this dependency map to ensure you have the foundations before tackling advanced topics:

| Module | Recommended Prerequisites |
|--------|--------------------------|
| M08 (Consistency Models) | M04 (Databases), M07 (ID Generation & Ordering) |
| M09 (Consensus & Coordination) | M07 (Logical Clocks), M08 (Consistency Models) |
| M10 (Distributed Transactions) | M04 (Databases), M08 (Consistency), M09 (Consensus) |
| M11 (Replication & Conflicts) | M04 (Database Replication), M08 (Consistency) |
| M12 (Architectural Patterns) | M02 (API Design), M04 (Databases), M06 (Caching) |
| M13 (Messaging & Streaming) | M12 (Event-Driven Architecture) |
| M14 (Search Systems) | M03 (Storage Engines — inverted indexes), M06 (Caching) |
| M16 (Reliability & Testing) | M01 (Networking), M12 (Architecture) |
| M19 (AI Inference) | M01 (Networking), M06 (Caching — KV cache parallels), M12 (Architecture) |
| M20 (RAG & Agents) | M14 (Search Systems — vector search), M19 (Inference Serving) |
| M22 (FinOps) | M17 (Observability), M12 (Architecture) |
| M23 (Data Privacy) | M04 (Databases), M15 (Security) |
| Capstones | All modules in Phases 1–3 (minimum); Phases 4–5 recommended |

**You don't need to follow this strictly** — but if a module feels confusing, check whether you've covered its prerequisites first.

## Learning Heuristics

1. **Don't Memorize, Derive**: If you understand why gRPC uses Protobuf (binary serialization, HTTP/2 multiplexing), you don't need to memorize that it's faster than REST.
2. **Visualize the Data Flow**: When reading about a concept, trace a single request from the user's thumb to the database disk.
3. **Question Every 'Best Practice'**: In system design, there is no "best," only "it depends." Always ask: "Depends on what?"

## Mastery Checklist

- Describe the "First Principles" (the problem it solves) without looking at notes
- Describe the trade-offs from memory
- Identify which pattern to use in a new scenario you haven't seen before
- Explain why an alternative pattern would be worse for that specific scenario
