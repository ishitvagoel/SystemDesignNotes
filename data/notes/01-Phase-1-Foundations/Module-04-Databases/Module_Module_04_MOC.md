# Module 04: Databases — Selection, Scaling & Operations

*Choosing, sharding, and operating the right database for the right access pattern.*

## Why This Module Matters

Module 3 gave you the engines inside databases. This module zooms out to the operational level: how do you choose between database systems, scale them beyond a single node, and operate them reliably? These decisions are among the hardest to reverse in system design — migrating from one database to another is one of the most painful engineering projects a team can undertake. Getting the initial choice right (or at least "right enough") saves months of future pain.

## Notes in This Module

### Selection
- [[SQL vs NoSQL Decision Framework]] — Choosing the right database model by matching access patterns, not following trends

### Indexing
- [[Indexing Deep Dive]] — B-tree, hash, GIN/GiST, partial, and covering indexes — how they work and when to use each

### Scaling
- [[Database Replication]] — Single-leader, multi-leader, leaderless replication topologies and their trade-offs
- [[Partitioning and Sharding]] — Hash vs range partitioning, hotspot mitigation, rebalancing strategies

### Next-Generation
- [[NewSQL and Globally Distributed Databases]] — Spanner, CockroachDB, TiDB — how they achieve global distribution with strong consistency

## Prerequisites
- [[_Module 03 MOC]] — Storage Engines & Database Internals (B-tree/LSM, WAL, MVCC, buffer pool)

## Where This Leads
- [[_Module 05 MOC]] — Data Modeling & Schema Evolution (schema design shapes how databases are queried and scaled)
- [[_Module 08 MOC]] — Consistency Models (replication directly connects to consistency guarantees)
- [[_Module 11 MOC]] — Replication & Conflict Resolution (deep dive into conflict resolution for multi-leader and leaderless replication)
- [[_Module 18 MOC]] — Multi-Tenancy, Geo-Distribution & Cost (geo-partitioned databases, data sovereignty)