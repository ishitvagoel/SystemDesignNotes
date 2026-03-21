# Buffer Pool and Page Cache

## Why This Exists

Disk I/O is slow. Even on NVMe SSDs, a random read takes ~100 microseconds — 1,000× slower than a memory access (~100 nanoseconds). A database that read from disk for every query would be unbearably slow. The buffer pool is a region of memory that caches frequently accessed data pages, turning disk reads into memory reads.

The buffer pool is arguably the most performance-critical component of a database. A well-tuned buffer pool means 99%+ of reads are served from memory. A poorly sized one means constant disk thrashing. Understanding how it works is the difference between a database that handles 50,000 queries per second and one that crawls at 500.

## Mental Model

The buffer pool is a librarian's reading desk with limited space. The full library (disk) has millions of books (pages). The desk (buffer pool) can hold a few hundred. When someone requests a book, the librarian checks the desk first. If it's there — cache hit, instant. If not — cache miss, the librarian walks to the stacks, finds the book, and brings it back. If the desk is full, one book must be returned to make room.

The critical question: *which book should be evicted?* A librarian who evicts the book that's about to be requested next causes another trip to the stacks. A smart eviction policy is the heart of buffer pool performance.

## How It Works

### Database Buffer Pool (Managed by the Database)

Traditional databases (Postgres, MySQL/InnoDB, Oracle) manage their own buffer pool — a dedicated region of memory holding data pages.

**Page lifecycle in the buffer pool**:

1. **Read request**: The query executor needs page 42. It checks the buffer pool's page table (a hash map: page ID → buffer frame).
2. **Cache hit**: Page is in the buffer pool. Return it. No disk I/O. This is the fast path and happens 95–99%+ of the time in a well-tuned system.
3. **Cache miss**: Page is not in memory. Allocate a buffer frame (or evict one), read the page from disk, insert it into the buffer pool, return it.
4. **Modification**: If the page is modified (INSERT, UPDATE, DELETE), it's marked **dirty**. Dirty pages are eventually flushed to disk by the background writer or checkpoint process (see [[Write-Ahead Log]]).
5. **Eviction**: When the buffer pool is full and a new page is needed, the eviction policy chooses a victim. The victim must be flushed to disk first if dirty.

**Eviction policies**:

**LRU (Least Recently Used)**: Evict the page accessed longest ago. Simple and reasonable for most workloads. But vulnerable to **sequential scan pollution**: a single full table scan loads every page, evicting hot, frequently-accessed pages from the buffer pool. After the scan, the working set must be reloaded from disk.

**Clock (approximation of LRU)**: Postgres uses a clock-sweep algorithm. Each page has a "usage count" (0–5). On access, increment (up to max). On eviction sweep, decrement each page's count; evict the first page with count 0. This approximates LRU without the overhead of maintaining a linked list.

**LRU-K / ARC**: More sophisticated policies that track access frequency, not just recency. InnoDB uses a modified LRU with a "young" and "old" sublist — pages start in the old sublist and move to the young sublist only if accessed again within a time window. This prevents scan pollution: a sequential scan's pages stay in the old sublist and are quickly evicted.

**Sizing the buffer pool**: The single most important database tuning parameter. Common guidance:

- **Postgres** (`shared_buffers`): 25% of system RAM is the starting point. Postgres also relies on the OS page cache for the remaining memory, effectively double-caching.
- **MySQL/InnoDB** (`innodb_buffer_pool_size`): 70–80% of system RAM on a dedicated database server. InnoDB manages its own I/O and prefers to control most of the available memory.
- **General principle**: Larger buffer pool = higher cache hit ratio = fewer disk reads = better performance. But leave enough memory for the OS, connections, sort buffers, and temporary tables.

### OS Page Cache (Managed by the Kernel)

The operating system maintains its own cache of recently accessed file pages in unused memory — the **page cache** (or filesystem cache). When a database reads a file, the data passes through the page cache. Even if the database's buffer pool doesn't cache the page, the OS page cache might.

**Double caching problem**: Postgres reads data through the OS page cache, and also caches it in shared_buffers. The same data can exist in both caches — wasted memory. This is why Postgres's shared_buffers recommendation is "only" 25% of RAM: the rest goes to the OS page cache, which serves as a second layer.

**InnoDB's approach**: InnoDB uses `O_DIRECT` (direct I/O) to bypass the OS page cache for data files. It manages all caching in its own buffer pool, avoiding double caching. This gives InnoDB precise control over eviction and prefetching, at the cost of more complex memory management.

**LSM-tree engines (RocksDB)**: RocksDB has its own block cache for SSTable data blocks, but also relies on the OS page cache for metadata and Bloom filter blocks. The interaction between RocksDB's block cache and the OS page cache is a common tuning challenge.

### I/O Scheduling and Prefetching

Smart buffer pool management goes beyond caching — it anticipates what data will be needed:

**Sequential prefetching**: If the query is doing a sequential scan, the buffer pool can read ahead — prefetching the next N pages before they're requested. This converts random I/O (one page at a time) into sequential I/O (large batch reads), which is dramatically faster on both HDDs and SSDs. Postgres has `effective_io_concurrency` for this.

**Index prefetching**: When traversing a B-tree index and collecting row pointers, the engine can sort the pointers by physical location and read the corresponding heap pages in order — converting random I/O into sequential. This is called a "bitmap heap scan" in Postgres.

**Write batching**: Rather than flushing dirty pages one at a time, the background writer collects a batch of dirty pages, sorts them by physical location, and writes them in a single sequential pass. This reduces disk head seeking (HDDs) and reduces write amplification (SSDs).

## Trade-Off Analysis

| Decision | Option A | Option B | Guidance |
|----------|----------|----------|----------|
| Buffer pool size | Conservative (25% RAM) | Aggressive (80% RAM) | Conservative for Postgres (relies on OS cache). Aggressive for InnoDB (manages its own I/O). |
| Direct I/O | Yes (bypass OS cache) | No (use OS cache) | Yes for InnoDB and dedicated database servers. No for Postgres (relies on OS cache). |
| Eviction policy | Simple LRU | LRU-K / scan-resistant | Scan-resistant for OLTP with mixed workloads (some scans, some point queries). |
| Prefetch aggressiveness | Conservative | Aggressive | Match to storage — SSDs benefit less from aggressive prefetch; HDDs benefit enormously. |

## Failure Modes

- **Buffer pool too small**: Cache hit ratio drops below 95%. The database constantly reads from disk. Query latency spikes under load. Monitoring: track `blks_hit` vs `blks_read` in Postgres (`pg_stat_database`), or `Innodb_buffer_pool_reads` vs `Innodb_buffer_pool_read_requests` in MySQL.

- **Sequential scan pollution**: A reporting query scans a large table, evicting the working set of an OLTP workload. OLTP latency spikes during and after the scan. Mitigation: InnoDB's old/young sublist, Postgres's small ring buffer for sequential scans, or separate the workloads (read replica for reporting).

- **OOM kill**: Buffer pool + connections + OS overhead exceeds available RAM. The Linux OOM killer terminates the database process. Mitigation: Leave 10–20% RAM headroom, set `vm.overcommit_memory` conservatively, use cgroups to limit database memory.

- **Dirty page flush storms**: A checkpoint flushes thousands of dirty pages at once, saturating disk I/O. Concurrent query latency spikes. Mitigation: fuzzy checkpoints, background writer with rate limiting, InnoDB's adaptive flushing.

## Architecture Diagram

```mermaid
graph TD
    Query[SQL Query Engine] -->|1. Request Page 42| BP[Buffer Pool Manager]
    
    subgraph "In-Memory Cache"
        BP -->|2. Check Hash Table| HT{Page Table}
        HT -->|Hit| Return[Return Buffer Pointer]
        HT -->|Miss| Evict[Choose Victim Page]
    end
    
    subgraph "Disk I/O"
        Evict -->|3. If Dirty| Flush[Write to Disk]
        BP -->|4. Read Page 42| Disk[(Data Files)]
        Disk -->|5. Load into Buffer| BP
    end

    style BP fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style HT fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Cache Hit Ratio**: A healthy production database should have a **>99%** hit ratio for its working set. Below 95% indicates severe memory pressure.
- **Sizing (Postgres)**: Set `shared_buffers` to **~25%** of system RAM.
- **Sizing (MySQL/InnoDB)**: Set `innodb_buffer_pool_size` to **~75%** of system RAM on a dedicated DB server.
- **Random vs Sequential**: Reading from the buffer pool is **~1,000x - 10,000x faster** than reading from an SSD (100ns vs 100µs - 1ms).

## Real-World Case Studies

- **PostgreSQL (The "Two-Cache" Strategy)**: Postgres famously uses a smaller `shared_buffers` and relies heavily on the **OS Page Cache** for the rest. This simplifies the database code but can lead to "double-caching" (the same page in both caches). However, it makes Postgres remarkably resilient to OS-level reboots, as the page cache warms up quickly.
- **MySQL/InnoDB (Direct I/O)**: InnoDB prefers `O_DIRECT`, which bypasses the OS page cache entirely. This gives it "exclusive" control over its memory, preventing double-caching and allowing for more predictable eviction policies (like the "Midpoint Insertion" strategy to prevent sequential scans from wiping out the cache).
- **LinkedIn (RocksDB Tuning)**: LinkedIn uses RocksDB for many of its internal key-value stores. They've written extensively about tuning the "Block Cache" (the LSM equivalent of a buffer pool) to balance between caching data, indexes, and Bloom filters, highlighting that for LSM-trees, caching the index is often more important than caching the data itself.

## Connections

- [[B-Tree vs LSM-Tree]] — B-trees depend heavily on the buffer pool for caching internal nodes; LSM-trees rely more on the block cache and OS page cache
- [[Write-Ahead Log]] — The WAL enables dirty pages to stay in the buffer pool safely; checkpoints flush dirty pages from the buffer pool to disk
- [[MVCC Deep Dive]] — MVCC version lookups happen against pages in the buffer pool
- [[Storage Engine Selection]] — Understanding buffer pool behavior helps choose the right engine for your workload

## Reflection Prompts

1. Your Postgres database has 200GB of data and 32GB of RAM (shared_buffers = 8GB). The cache hit ratio is 92%. A colleague suggests upgrading to 64GB of RAM and setting shared_buffers to 16GB. Will this help? How do you predict the new cache hit ratio? What other approach might be more effective?

2. You're running InnoDB with `innodb_buffer_pool_size = 50GB` on a server with 64GB RAM. A monitoring alert fires: buffer pool hit ratio has dropped from 99.5% to 85% over the past hour. What happened, and how do you diagnose it?

## Canonical Sources

- *Database Internals* by Alex Petrov — Chapters 5–6 cover buffer management, eviction policies, and I/O scheduling in detail
- PostgreSQL documentation, "Chapter 19: Server Configuration" — shared_buffers, effective_cache_size, and I/O tuning parameters
- MySQL/InnoDB documentation, "InnoDB Buffer Pool" — configuration, monitoring, and the old/young sublist eviction policy
- Brendan Gregg, "Systems Performance" (2nd ed) — Chapter on memory and I/O covers the OS page cache and its interaction with database buffer pools