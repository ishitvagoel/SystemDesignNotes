# Module 07: Unique ID Generation & Ordering

*The deceptively hard problem of naming things in a distributed world.*

## Why This Module Matters

Every entity in a system needs a unique identifier. It sounds trivial — just increment a counter. But in a distributed system with no single coordinator, generating IDs that are unique, sortable, compact, and coordination-free becomes a real design challenge. The choice of ID format affects database performance (B-tree fragmentation with random UUIDs), debugging (can you tell when an entity was created from its ID?), partitioning (is the ID a good shard key?), and even security (can an attacker enumerate IDs?).

This module also introduces **logical clocks** — the foundational mechanism for ordering events in a distributed system without relying on synchronized wall clocks. These concepts resurface heavily in Module 8 (Consistency Models) and Module 11 (Replication & Conflict Resolution).

## Notes in This Module

### ID Formats
- [[01-Phase-1-Foundations__Module-07-ID-Generation__ID_Generation_Strategies]] — UUIDs (v4, v7), Snowflake IDs, ULID, TSID — trade-offs in sortability, size, collision resistance, and coordination requirements

### Ordering & Causality
- [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]] — Lamport timestamps, vector clocks, and hybrid logical clocks — how to order events when you can't trust wall clocks

## Prerequisites
- [[Module_Module_03_MOC]] — Storage Engines (ID format impacts B-tree vs LSM-tree performance)
- [[Module_Module_04_MOC]] — Databases (ID choice affects indexing, partitioning, and replication)

## Where This Leads
- [[Module_Module_08_MOC]] — Consistency Models (logical clocks are the foundation for reasoning about consistency)
- [[Module_Module_11_MOC]] — Replication & Conflict Resolution (version vectors and causal ordering)
- [[Module_Module_10_MOC]] — Distributed Transactions (transaction ordering depends on clock mechanisms)