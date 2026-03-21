# References Hub

Canonical sources organized by the modules they inform. Every reference listed in this vault is one the author is confident exists.

## Source Hierarchy

```mermaid
graph TD
    P1[Primary: Papers & Specs] -->|Formal Foundations| P2[Secondary: Books]
    P2 -->|Structural Guidance| P3[Tertiary: Engineering Blogs]
    P3 -->|Real-world implementation| P4[Tactical: Docs & Tutorials]
    
    style P1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style P3 fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Vetting Heuristics (The "Senior" Standard)

When reading a new technical resource, check:
1. **The "Why" Test**: Does the author explain the failure mode that motivated the design?
2. **The "Anti-Pattern" Test**: Does the resource list when *not* to use the technology?
3. **The "Scale" Test**: Is the advice applicable to 100 users, or 100 million?
4. **The "Vendor" Test**: Is the source biased toward a specific tool? Always cross-reference vendor blogs with independent papers.

## Books

### Martin Kleppmann — *Designing Data-Intensive Applications* (2017)
The single most important reference. Chapters map to vault modules:
- Ch 2: Data Models → M5 (Data Modeling)
- Ch 3: Storage & Retrieval → M3 (Storage Engines), M4 (Indexing)
- Ch 4: Encoding & Evolution → M5 (Schema Evolution)
- Ch 5: Replication → M4 (Replication), M8 (Consistency), M11 (Conflict Resolution)
- Ch 6: Partitioning → M4 (Sharding)
- Ch 7: Transactions → M3 (MVCC), M10 (Distributed Transactions)
- Ch 8: Trouble with Distributed Systems → M7 (Clocks), M9 (FLP)
- Ch 9: Consistency & Consensus → M8, M9 (Raft, Paxos, Linearizability)
- Ch 10–11: Batch & Stream → M13 (Pipelines, Stream Processing)

### Alex Petrov — *Database Internals* (2019)
Deep engine-level coverage → M3 (B-trees, LSM, WAL, Buffer Pool), M4 (Distributed DB internals)

### Sam Newman — *Building Microservices* (2nd ed, 2021)
Service decomposition, communication, deployment → M12, M2 (API Design), M15 (Security)

### Chris Richardson — *Microservices Patterns* (2018)
Sagas, CQRS, event sourcing, messaging → M10, M12, M13

### Google SRE Book — *Site Reliability Engineering* (2016)
SLOs, error budgets, incident response, on-call → M16

### Alex Xu — *System Design Interview* Vol 1 & 2
Practical system design walkthroughs → All capstones

### Alex Xu — *Generative AI System Design Interview* (2024)
AI-specific patterns → M19, M20, Capstone 5

### John Ousterhout — *A Philosophy of Software Design* (2018)
Deep modules, complexity management → M12 (Architecture decisions)

### Brendan Burns — *Designing Distributed Systems* (2nd ed, 2024)
Container patterns, K8s, AI inference → M21, M19

## Key Papers

| Paper | Year | Relevant Modules |
|-------|------|-----------------|
| Lamport, "Time, Clocks, and the Ordering of Events" | 1978 | M7, M8 |
| Fischer, Lynch, Paterson, "Impossibility of Consensus" | 1985 | M9 |
| Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm" (Raft) | 2014 | M9 |
| Lamport, "Paxos Made Simple" | 2001 | M9 |
| DeCandia et al., "Dynamo" | 2007 | M11 |
| Corbett et al., "Spanner" | 2012 | M4 |
| Shapiro et al., "CRDTs" | 2011 | M11 |
| Vogels, "Eventually Consistent" | 2008 | M8 |
| Kwon et al., "PagedAttention / vLLM" | 2023 | M19 |
| Lewis et al., "Retrieval-Augmented Generation" | 2020 | M20 |

## Engineering Blogs

| Blog | Topics | Referenced In |
|------|--------|--------------|
| Stripe | Payments, idempotency, API design, rate limiting | M2, M10, Capstone 3 |
| Cloudflare | Edge compute, DNS, TLS, CDN, Pingora, eBPF | M1, M6, M15, M17, M21 |
| Figma | CRDTs, real-time collaboration, multiplayer | M11, M20, Capstone 4 |
| Netflix | Chaos engineering, microservices, CDN | M12, M16 |
| Discord | Cassandra→ScyllaDB migration, Rust, Elixir | M4 |
| Meta | GPU clusters, TAO cache, backbone engineering | M19 |
| Uber | Geospatial, Cadence/Temporal, Schemaless | M10 |
| LinkedIn | Kafka, GraphQL federation | M1, M13 |
| Jay Kreps | "The Log" essay, Kafka, event streaming | M3, M12, M13 |