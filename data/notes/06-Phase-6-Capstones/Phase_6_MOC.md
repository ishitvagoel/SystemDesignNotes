# Capstone Projects

Each capstone walks through the full design evolution of a real system: requirements → estimation → design → trade-offs → failure analysis → production hardening → cost analysis → evolution path. They synthesize concepts from across the vault.

## The Capstones

1. [[06-Phase-6-Capstones__Capstone_—_URL_Shortener]] — Deceptively simple; teaches estimation, storage, caching, unique ID generation, analytics pipelines
2. [[06-Phase-6-Capstones__Capstone_—_News_Feed]] — Fan-out strategies, ranking, caching at scale, read-heavy optimization
3. [[06-Phase-6-Capstones__Capstone_—_Payments_and_Orders]] — Distributed transactions, idempotency, saga patterns, event sourcing
4. [[06-Phase-6-Capstones__Capstone_—_Collaborative_Editor]] — CRDTs/OT, WebSockets, presence, conflict resolution
5. [[06-Phase-6-Capstones__Capstone_—_AI_Search_and_Chat_Platform]] — RAG pipeline, vector search, LLM gateway, semantic caching, agentic tool use
6. [[06-Phase-6-Capstones__Capstone_—_Multi-Region_E-Commerce]] — Data classification by consistency/sovereignty/latency, per-type replication strategy, global routing
7. [[06-Phase-6-Capstones__Capstone_—_Feature_Flag_Platform]] — Flag evaluation pipeline, SDK design (push vs pull), A/B experiment analytics, stale flag cleanup

## The Capstone Loop

```mermaid
graph LR
    S1[Requirements] --> S2[Back-of-Envelope]
    S2 --> S3[High Level Design]
    S3 --> S4[Deep Dives]
    S4 --> S5[Trade-offs & Bottlenecks]
    
    style S3 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style S5 fill:var(--surface),stroke:#ff4d4d,stroke-width:2px;
```

## Senior Engineer's Interview Heuristic

- **Start Simple**: Don't lead with Kafka and Kubernetes. Start with a single server and database, then scale only as requirements demand.
- **Drive the Trade-offs**: For every component you add, explain what you are sacrificing (Complexity? Cost? Consistency?).
- **Think in Numbers**: Use the heuristics from each note. 100M users is different from 1M users. Know your RPS, your storage volume, and your latency budget.