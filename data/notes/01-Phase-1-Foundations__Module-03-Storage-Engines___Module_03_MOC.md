# Module 03: Storage Engines & Database Internals

*What happens between your query and the disk — the engines beneath every database.*

## Why This Module Matters

Every database you'll ever use — Postgres, MySQL, MongoDB, Cassandra, CockroachDB — is built on a storage engine. The storage engine determines how data is written to disk, how it's read back, how concurrent access is managed, and what the fundamental performance characteristics are. When an engineer says "Postgres is slow for write-heavy workloads" or "Cassandra is fast for writes," they're really talking about the storage engine underneath.

Understanding storage engines gives you the ability to predict database behavior from first principles rather than relying on benchmarks and folklore. When you know that RocksDB uses an LSM-tree, you can reason about write amplification, compaction storms, and space amplification without ever running a benchmark.

## Notes in This Module

### Core Data Structures
- [[B-Tree vs LSM-Tree]] — The two fundamental storage engine designs and their amplification trade-offs

### Durability & Recovery
- [[Write-Ahead Log]] — How databases guarantee durability without writing data in place, checkpoint strategies, and WAL-based replication

### Concurrency Control
- [[MVCC Deep Dive]] — How Postgres, MySQL/InnoDB, and Spanner implement snapshot isolation differently, and why it matters

### Memory & I/O Management
- [[Buffer Pool and Page Cache]] — How databases manage memory, minimize disk I/O, and interact with the OS page cache

### Decision Framework
- [[Storage Engine Selection]] — When to use B-tree engines, LSM-tree engines, or hybrid approaches, matched to workload patterns

## Prerequisites
- [[_Module 01 MOC]] — Networking fundamentals (storage engines are local, but understanding I/O latency and throughput sets the frame)

## Where This Leads
- [[_Module 04 MOC]] — Databases: Selection, Scaling & Operations (builds on storage engine knowledge to reason about indexing, replication, and sharding)
- [[_Module 05 MOC]] — Data Modeling & Schema Evolution (schema design interacts with storage engine behavior)
- [[_Module 08 MOC]] — Consistency Models (MVCC connects to isolation levels and consistency guarantees)
- [[_Module 11 MOC]] — Replication & Conflict Resolution (WAL is the mechanism beneath replication)