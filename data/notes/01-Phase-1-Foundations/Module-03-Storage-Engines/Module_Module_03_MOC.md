# Module 03: Storage Engines & Database Internals

*What happens between your query and the disk — the engines beneath every database.*

## Why This Module Matters

Every database you'll ever use — Postgres, MySQL, MongoDB, Cassandra, CockroachDB — is built on a storage engine. The storage engine determines how data is written to disk, how it's read back, how concurrent access is managed, and what the fundamental performance characteristics are. When an engineer says "Postgres is slow for write-heavy workloads" or "Cassandra is fast for writes," they're really talking about the storage engine underneath.

Understanding storage engines gives you the ability to predict database behavior from first principles rather than relying on benchmarks and folklore. When you know that RocksDB uses an LSM-tree, you can reason about write amplification, compaction storms, and space amplification without ever running a benchmark.

## Notes in This Module

### Core Data Structures
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]] — The two fundamental storage engine designs and their amplification trade-offs

### Durability & Recovery
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] — How databases guarantee durability without writing data in place, checkpoint strategies, and WAL-based replication

### Concurrency Control
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__MVCC_Deep_Dive]] — How Postgres, MySQL/InnoDB, and Spanner implement snapshot isolation differently, and why it matters

### Memory & I/O Management
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Buffer_Pool_and_Page_Cache]] — How databases manage memory, minimize disk I/O, and interact with the OS page cache

### Decision Framework
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Storage_Engine_Selection]] — When to use B-tree engines, LSM-tree engines, or hybrid approaches, matched to workload patterns

## Prerequisites
- [[Module_Module_01_MOC]] — Networking fundamentals (storage engines are local, but understanding I/O latency and throughput sets the frame)

## Where This Leads
- [[Module_Module_04_MOC]] — Databases: Selection, Scaling & Operations (builds on storage engine knowledge to reason about indexing, replication, and sharding)
- [[Module_Module_05_MOC]] — Data Modeling & Schema Evolution (schema design interacts with storage engine behavior)
- [[Module_Module_08_MOC]] — Consistency Models (MVCC connects to isolation levels and consistency guarantees)
- [[Module_Module_11_MOC]] — Replication & Conflict Resolution (WAL is the mechanism beneath replication)