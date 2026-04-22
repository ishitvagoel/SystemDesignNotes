# Module 04: Databases — Selection, Scaling & Operations

*Choosing, sharding, and operating the right database for the right access pattern.*

## Why This Module Matters

Module 3 gave you the engines inside databases. This module zooms out to the operational level: how do you choose between database systems, scale them beyond a single node, and operate them reliably? These decisions are among the hardest to reverse in system design — migrating from one database to another is one of the most painful engineering projects a team can undertake. Getting the initial choice right (or at least "right enough") saves months of future pain.

## Notes in This Module

### Selection
- [[01-Phase-1-Foundations__Module-04-Databases__SQL_vs_NoSQL_Decision_Framework]] — Choosing the right database model by matching access patterns, not following trends

### Indexing
- [[01-Phase-1-Foundations__Module-04-Databases__Indexing_Deep_Dive]] — B-tree, hash, GIN/GiST, partial, and covering indexes — how they work and when to use each
- [[01-Phase-1-Foundations__Module-04-Databases__Query_Optimization_and_EXPLAIN]] — Cost-based optimizer mechanics, EXPLAIN output walkthrough, common anti-patterns (N+1, SELECT *, implicit casting), and index design for query performance

### Scaling
- [[01-Phase-1-Foundations__Module-04-Databases__Database_Replication]] — Single-leader, multi-leader, leaderless replication topologies and their trade-offs
- [[01-Phase-1-Foundations__Module-04-Databases__Partitioning_and_Sharding]] — Hash vs range partitioning, hotspot mitigation, rebalancing strategies

### Next-Generation
- [[01-Phase-1-Foundations__Module-04-Databases__NewSQL_and_Globally_Distributed_Databases]] — Spanner, CockroachDB, TiDB — how they achieve global distribution with strong consistency

## Prerequisites
- [[Module_Module_03_MOC]] — Storage Engines & Database Internals (B-tree/LSM, WAL, MVCC, buffer pool)

## Where This Leads
- [[Module_Module_05_MOC]] — Data Modeling & Schema Evolution (schema design shapes how databases are queried and scaled)
- [[Module_Module_08_MOC]] — Consistency Models (replication directly connects to consistency guarantees)
- [[Module_Module_11_MOC]] — Replication & Conflict Resolution (deep dive into conflict resolution for multi-leader and leaderless replication)
- [[Module_Module_18_MOC]] — Multi-Tenancy, Geo-Distribution & Cost (geo-partitioned databases, data sovereignty)