# Storage Engine Selection

## Why This Exists

You know how B-trees and LSM-trees work ([[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]]). You understand the amplification trade-offs. Now comes the practical question: given a specific workload, which engine should you use? This note is the decision framework.

The answer is almost never "one is universally better." It depends on your read/write ratio, latency requirements, data size relative to memory, key distribution, and operational tolerance. The goal is to match the engine's strengths to your workload's demands.


## Mental Model

Choosing a storage engine is like choosing between a filing cabinet (B-tree) and a mail sorting machine (LSM-tree). You wouldn't sort your personal files with an industrial mail sorter, and you wouldn't run a post office with a filing cabinet. The right answer depends on your workload: How much mail are you receiving (write volume)? How often do you need to find a specific file (read patterns)? Do you need to sort through ranges of files (range scans)? How much floor space do you have (storage budget)? The engine doesn't change your data — it changes how efficiently you can access it under your specific workload.

## Decision Framework

### Start With the Workload Profile

Ask three questions:

1. **What's the read/write ratio?**
   - Read-heavy (90%+ reads): B-tree engines shine. Predictable read latency, excellent caching behavior.
   - Write-heavy (70%+ writes): LSM-tree engines shine. Sequential writes, high throughput.
   - Balanced (50/50): Either can work; look at the other factors.

2. **What's the access pattern?**
   - Point lookups (get by primary key): B-tree is slightly faster (fewer I/O steps). LSM is close with Bloom filters.
   - Range scans (get all orders in date range): B-tree is usually faster (data is stored sorted in place). LSM can be competitive if data is concentrated in few levels.
   - Full table scans: Similar performance; both are I/O-bound.

3. **What's the key distribution?**
   - Sequential / time-ordered keys: Both handle well. B-tree avoids random splits; LSM benefits from sequential write patterns.
   - Random keys (UUIDv4): B-tree suffers from random page splits and poor cache locality. LSM handles this well — all writes go to the memtable regardless of key order.

### The Decision Matrix

| Workload Characteristic | Favors B-Tree | Favors LSM-Tree |
|-------------------------|--------------|-----------------|
| Read-heavy (OLTP reads) | ✓ | |
| Write-heavy (ingestion, logging) | | ✓ |
| Point lookups dominate | ✓ (slightly) | |
| Range scans dominate | ✓ | |
| Random key inserts | | ✓ |
| Data fits in memory | ✓ (either works) | ✓ (either works) |
| Data far exceeds memory | ✓ (predictable I/O) | ✓ (better compression) |
| Latency predictability critical | ✓ | (compaction spikes) |
| Write throughput critical | | ✓ |
| Storage space constrained | | ✓ (better compression) |
| Simple operations / tuning | ✓ | (compaction tuning) |

### Common Workloads Mapped to Engines

**Traditional OLTP (e-commerce, SaaS, CRUD apps)**: B-tree (Postgres, MySQL/InnoDB). Read-heavy with indexes. Predictable latency matters. This is the default choice for most applications, and the right one.

**Time-series data (metrics, IoT, event logs)**: LSM-tree (TimescaleDB/Postgres for moderate scale, InfluxDB, or Cassandra/ScyllaDB for large scale). High write throughput, sequential timestamps, range scans by time window. LSM's sequential write pattern aligns perfectly.

**Key-value store (caching, session storage)**: Either. For pure key-value with point lookups, B-tree (e.g., BoltDB) is predictable. For high-throughput writes, LSM (RocksDB) is faster. Redis avoids the question entirely (in-memory).

**Analytical workloads (OLAP, data warehouse)**: Column-oriented engines (not B-tree or LSM in the traditional sense). ClickHouse, DuckDB, Apache Parquet files. The access pattern (scan many rows, few columns) favors columnar storage over either row-based engine type.

**Globally distributed databases**: LSM-tree dominates this space. CockroachDB uses Pebble (a RocksDB-compatible LSM engine). TiDB uses RocksDB. Spanner uses a custom storage layer. The write throughput and compression characteristics of LSM suit the high write amplification inherent in distributed replication.

**Embedded databases (mobile, IoT, browser)**: SQLite (B-tree), or LevelDB/RocksDB (LSM) for write-optimized embedded storage.

### Hybrid Approaches

The B-tree vs LSM binary is increasingly blurred:

**WiredTiger** (MongoDB's engine): Uses a B-tree variant with LSM-like write buffering. Writes go to an in-memory tree, periodically reconciled with the on-disk tree. Gets some of LSM's write benefits without the full compaction complexity.

**BW-Tree** (used in SQL Server's Hekaton): A latch-free B-tree optimized for modern multi-core hardware. Uses a mapping table to enable lock-free page updates and log-structured delta records instead of in-place modification.

**Pebble** (CockroachDB): A Go-native LSM-tree engine inspired by RocksDB but with improvements for CockroachDB's specific workload (range deletions, prefix bloom filters).

**TiKV's storage** (TiDB): Uses RocksDB as the base LSM engine but layers a Raft-based replication log on top, creating an interesting interaction between the replication log and the LSM-tree's WAL.

## When the Engine Doesn't Matter

If your data fits in memory (working set ≤ buffer pool), both engines serve reads from memory. The choice matters most for disk I/O patterns, and if there's no disk I/O for reads, the difference shrinks. In this case, optimize for write patterns and operational simplicity.

For most startups and early-stage products: **just use Postgres.** Its B-tree engine handles the vast majority of workloads competently. You can always migrate to a specialized engine when you have concrete evidence of a bottleneck. Premature optimization of the storage engine is one of the most common wastes of engineering time.

## When to Switch Engines

Signals that you might need to re-evaluate:

- **Write latency exceeding SLO** with B-tree under heavy insert load → consider LSM
- **Compaction storms causing read latency spikes** with LSM → tune compaction, or consider B-tree if reads are more critical
- **Disk usage growing faster than data** → check amplification factors; consider leveled compaction or B-tree
- **Read latency P99 unpredictable** with LSM → Bloom filter tuning, or B-tree for more predictable reads
- **You're running out of IOPS** → LSM's sequential writes use fewer IOPS; or provision more I/O

## Trade-Off Analysis

| Engine Type | Write Pattern | Read Pattern | Space Efficiency | Best For |
|-------------|--------------|-------------|-----------------|----------|
| B-Tree (InnoDB, PostgreSQL) | Moderate — random I/O, in-place updates | Excellent — O(log N) point lookups | Good — some fragmentation | OLTP, mixed read/write, range queries |
| LSM-Tree (RocksDB, LevelDB, Cassandra) | Excellent — sequential writes, batch | Good for recent data, compaction tax for old | Lower — write amplification from compaction | Write-heavy, time-series, append-mostly |
| B-Tree + column store (Parquet, ClickHouse) | Batch-oriented | Excellent for analytics, poor for point lookups | Excellent — columnar compression | OLAP, analytics, data warehousing |
| In-memory (Redis, Memcached, VoltDB) | Excellent — no disk I/O | Excellent — sub-millisecond | Poor — RAM is expensive | Caching, session store, real-time leaderboards |
| Heap + WAL (PostgreSQL heap) | Good — append WAL, update heap | Requires indexing, heap can bloat | Moderate — dead tuples accumulate | General-purpose with proper VACUUM tuning |

**The compaction tax**: LSM-trees trade read performance and space amplification for write performance. Every piece of data is rewritten multiple times during compaction. For write-heavy workloads (metrics, logs, IoT), this is a good trade. For read-heavy workloads with random access, B-trees win because they don't pay the compaction cost.

## Failure Modes

**LSM compaction stalls**: Under sustained write pressure, LSM-tree compaction can't keep up — L0 files accumulate faster than they're merged into sorted runs. Read latency spikes because queries must check more L0 files. Eventually the engine throttles writes or stalls entirely. Solution: tune compaction concurrency, use leveled compaction (RocksDB), provision sufficient I/O bandwidth, and monitor compaction pending bytes.

**B-tree page splits under sequential inserts**: Inserting monotonically increasing keys (auto-increment IDs, timestamps) always hits the rightmost leaf page, causing repeated page splits. This is actually efficient for B-trees (append-only pattern). But random UUID inserts cause splits throughout the tree, fragmenting the index and degrading range scan performance. Solution: use time-ordered IDs (UUIDv7, ULID) instead of random UUIDs for primary keys.

**Write amplification surprise in LSM-trees**: A single application write may be rewritten 10-30x due to compaction (write amplification). On SSDs with limited write endurance, this can shorten disk lifespan significantly. Teams discover this only when SSDs start reporting wear-out warnings. Solution: monitor actual disk write throughput (not just application writes), tune compaction to reduce write amplification, consider tiered compaction for write-heavy workloads.

**Engine mismatch for workload evolution**: A system designed for write-heavy ingestion (LSM-tree) gradually shifts to read-heavy analytics. The compaction overhead that was acceptable during writes becomes a bottleneck for reads. Or a B-tree system designed for OLTP gets repurposed for bulk loading. Solution: re-evaluate engine choice as workload changes, consider migrating to a different engine (PostgreSQL supports this via `pg_migrator`, RocksDB options can be tuned).

**In-memory engine data loss**: An in-memory engine (Redis without persistence, Memcached) loses all data on crash or restart. Teams forget to enable persistence or configure it incorrectly (RDB snapshots too infrequent, AOF not fsynced). Solution: always enable AOF with `appendfsync everysec` for Redis if data matters, or treat in-memory stores as caches only — never the single source of truth.

## Architecture Diagram

```mermaid
graph TD
    Workload[New Application Workload] --> Q1{Read vs Write Ratio?}
    
    Q1 -- "Read-Heavy (90/10)" --> BTree[B-Tree Engine]
    Q1 -- "Write-Heavy (20/80)" --> LSM[LSM-Tree Engine]
    
    BTree --> Q2{Point vs Range?}
    LSM --> Q3{Latency Critical?}
    
    Q2 -- "Point Lookups" --> Postgres[PostgreSQL / MySQL]
    Q2 -- "Analytics Scans" --> Columnar[DuckDB / ClickHouse]
    
    Q3 -- "Yes (No Spikes)" --> WiredTiger[MongoDB WiredTiger]
    Q3 -- "No (High Throughput)" --> Cassandra[Cassandra / RocksDB]

    style BTree fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style LSM fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Write-Heavy Threshold**: If your application does **> 10,000 writes/sec** on a single node, consider moving from B-Tree (Postgres) to LSM (RocksDB/Cassandra).
- **Read-Heavy Threshold**: If your working set fits in RAM, B-Tree reads are almost always faster due to fewer pointer indirections.
- **SSD Longevity**: LSM-trees have high **Write Amplification (10x-30x)**. Monitor your SSD's TBW (Total Bytes Written) to ensure you don't wear out the drive in < 3 years.
- **Compaction Headroom**: Always leave **~30-50% free disk space** for LSM-tree engines to allow for background compaction without running out of space.

## Real-World Case Studies

- **Instagram (Postgres/B-Tree)**: Instagram stores billions of photos and user relationships in Postgres. Because their workload is heavily read-biased (users looking at feeds), the B-tree's predictable read performance is more valuable than LSM's write throughput. They scale writes by sharding across hundreds of Postgres instances.
- **WhatsApp (Mnesia/LSM-like)**: WhatsApp's messaging backend (built on Erlang/Ejabberd) uses storage engines optimized for high-concurrency writes. In a chat app, every message is a write, making the append-only nature of LSM-like structures ideal for their "firehose" of messages.
- **Discord (Cassandra to ScyllaDB)**: Discord originally used Cassandra (LSM) for their message storage. As they grew, they hit "compaction storms" that caused massive latency spikes. They switched to ScyllaDB (a C++ rewrite of Cassandra) which offers better compaction scheduling and lower tail latency while keeping the LSM architecture for high write volume.

## Connections

- [[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]] — The foundational comparison this framework is built on
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] — WAL behavior differs between engines; LSM uses WAL for memtable durability, B-tree uses WAL for page-level crash recovery
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Buffer_Pool_and_Page_Cache]] — Buffer pool sizing depends on the engine type; B-trees benefit more from large buffer pools
- [[01-Phase-1-Foundations__Module-04-Databases__SQL_vs_NoSQL_Decision_Framework]] — Engine selection is one input to the broader database choice
- [[01-Phase-1-Foundations__Module-07-ID-Generation__ID_Generation_Strategies]] — Key design (sequential vs random) directly impacts engine performance

## Reflection Prompts

1. You're building a system that ingests 100,000 events per second (write-heavy), each tagged with a timestamp. Queries are exclusively time-range scans over the last 24 hours. You're choosing between Postgres (B-tree) and Cassandra (LSM). Walk through the amplification trade-offs for each. Which would you choose, and what's the deciding factor?

2. Your team uses CockroachDB (LSM-tree via Pebble) for a mixed OLTP workload. Reads are meeting SLO, but you're seeing p99 latency spikes to 200ms every few minutes during compaction. What are your options? Would switching to a B-tree engine (like Postgres) solve the problem, or are there tuning approaches first?

## Canonical Sources

- *Database Internals* by Alex Petrov — the most comprehensive treatment of storage engine design and selection
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 3: "Storage and Retrieval" is the essential primer
- Mark Callaghan, "Choosing Between B-Tree and LSM" (various talks and blog posts) — Callaghan worked on both InnoDB and RocksDB at MySQL/Facebook and provides uniquely informed comparisons
- RocksDB Tuning Guide — practical guidance for tuning LSM-tree behavior in production