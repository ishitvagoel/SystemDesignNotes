# Partitioning and Sharding

## Why This Exists

Replication copies the same data to multiple nodes for fault tolerance and read scalability. But every replica still holds the entire dataset, and all writes go to the leader. When the dataset is too large to fit on one machine, or when write throughput exceeds what one machine can handle, you need to **partition** (split) the data across multiple nodes.

Partitioning divides a large dataset into smaller chunks, each stored on a different node. Each node handles reads and writes only for its partitions. This provides **horizontal write scaling** (more nodes = more total write throughput) and allows datasets far larger than a single machine's storage.

The terms: **partitioning** is the general concept. **Sharding** usually refers to partitioning across separate database instances. They're used interchangeably in practice.

## Mental Model

Imagine a library that's outgrown its building. You build three branch libraries:

- **Range partitioning**: Branch 1 has books A–H, Branch 2 has I–P, Branch 3 has Q–Z. If someone wants a book starting with 'M', they go to Branch 2. Simple, but if all the popular new books start with 'S', Branch 3 is overwhelmed (hotspot).

- **Hash partitioning**: Each book's title is hashed to a number 0–2. Hash=0 goes to Branch 1, hash=1 to Branch 2, hash=2 to Branch 3. Traffic is evenly distributed, but you can't browse the shelves in alphabetical order anymore — books starting with 'A' are scattered across all three branches.

## How It Works

### Range Partitioning

Data is split into contiguous key ranges. Each partition owns a range: partition 1 handles keys 0–999, partition 2 handles 1000–1999, etc.

**Strengths**: Range queries are efficient — a query for keys 500–700 goes to a single partition. This is critical for time-series data (partition by month), geographic data (partition by region), or any access pattern that naturally queries contiguous ranges.

**Weaknesses**: **Hotspots.** If access is concentrated in a narrow key range (all writes are to "today's" partition, or a celebrity's user ID is in one partition), that partition becomes a bottleneck while others idle. Range partitioning requires monitoring for hotspots and rebalancing when they occur.

**Used by**: Postgres native partitioning, HBase, Spanner, CockroachDB (with automatic range splitting).

### Hash Partitioning

Apply a hash function to the partition key, then assign each hash range to a partition. `partition = hash(key) mod N` (simple modular hashing) or consistent hashing (see [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Consistent_Hashing]]).

**Strengths**: Uniform distribution. Even if keys are sequential (auto-incrementing IDs, timestamps), the hash scatters them across partitions. Hotspots are rare unless the actual values are skewed (one user has 1 million records).

**Weaknesses**: Range queries are destroyed. A query for keys 500–700 must hit *every* partition because the hash scatters them. This is the fundamental trade-off of hash partitioning — you get even distribution, you lose range locality.

**Used by**: DynamoDB (partition key hashing), Cassandra (partition key), MongoDB (hashed shard key), Redis Cluster.

### Compound Partitioning

The practical middle ground. Use the first part of a compound key for partitioning and the second part for ordering within the partition.

Example in Cassandra: primary key `((user_id), created_at)`. Data is hash-partitioned by `user_id` (even distribution across nodes) and sorted by `created_at` within each partition (efficient range scans for a single user's time-ordered data).

This pattern gives you the benefits of both approaches: hash distribution across partitions, range queries within a partition. DynamoDB calls this "partition key + sort key." It's the core data modeling primitive in wide-column and key-value stores.

### Hotspot Mitigation

Even with hash partitioning, hotspots happen when a single key is extremely popular (a viral post, a celebrity user, a product going viral).

**Strategies**:
- **Key salting**: Append a random suffix to hot keys. Instead of one partition handling `user:celebrity`, distribute across `user:celebrity_0`, `user:celebrity_1`, ..., `user:celebrity_9`. Reads must query all 10 and merge. This is manual and application-specific.
- **Scatter-gather**: Accept the hotspot but replicate the hot partition across more nodes. Reads scatter across all copies.
- **Write buffering**: Absorb hot writes in a cache (Redis) and flush to the database in batches.
- **Application-level routing**: Detect hot keys (via monitoring) and route them to dedicated, larger nodes.

There's no universal solution. Hotspot mitigation is workload-specific and often requires application awareness.

### Rebalancing Strategies

As data grows or nodes are added/removed, partitions must be redistributed. This is rebalancing, and it's one of the most operationally complex aspects of sharding.

**Fixed number of partitions**: Create many more partitions than nodes (e.g., 1000 partitions across 10 nodes = 100 partitions per node). When adding a node, move some partitions to it. No partition splitting needed. Used by Elasticsearch, Riak, CockroachDB. Downside: choosing the right initial partition count requires guessing future data size.

**Dynamic splitting**: Start with one partition per range. When a partition exceeds a size threshold, split it in two. When a partition shrinks, merge adjacent ones. Used by HBase, Spanner. Adapts to data size naturally but splitting/merging adds operational complexity.

**Consistent hashing with virtual nodes**: Each physical node owns many "virtual nodes" (positions on the hash ring). Adding a physical node means redistributing some virtual nodes from existing nodes. Only a small fraction of data moves. See [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Consistent_Hashing]].

**The rebalancing danger — data movement storms**: Moving partitions between nodes means transferring potentially gigabytes of data over the network. If too many partitions move simultaneously, the network is saturated, and the cluster's performance degrades during rebalancing. Mitigation: throttle rebalancing speed, rebalance during off-peak hours, use incremental rebalancing.

## Cross-Partition Operations

Partitioning creates boundaries that queries must respect. Operations that cross partition boundaries are the primary source of sharding pain:

**Cross-partition queries**: `SELECT * FROM orders WHERE status = 'pending'` when orders are partitioned by `user_id`. Every partition must be scanned. This is a scatter-gather operation — latency is determined by the slowest partition.

**Cross-partition joins**: Joining `orders` (partitioned by `user_id`) with `products` (partitioned by `product_id`) requires shuffling data between partitions. This is why joins are limited or absent in most sharded databases. Denormalization (storing a copy of product data in the orders table) avoids the join at the cost of storage and update complexity.

**Cross-partition transactions**: A transaction spanning two partitions requires distributed coordination (2PC or similar). This is expensive and complex — see [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Two-Phase_Commit]]. Many sharded databases don't support cross-partition transactions at all (Cassandra), or support them with significant performance overhead (CockroachDB, Spanner).

**Secondary indexes across partitions**: Two approaches:
- **Local indexes** (document-partitioned): Each partition has its own index covering only its data. A query on the secondary index must scatter to all partitions. Used by MongoDB, Cassandra.
- **Global indexes** (term-partitioned): The secondary index is itself partitioned by the indexed value. A query on the index goes to one partition — fast. But writes must update the index on a different partition than the data — cross-partition write overhead. Used by DynamoDB global secondary indexes.

## Trade-Off Analysis

| Dimension | Range Partitioning | Hash Partitioning |
|-----------|-------------------|-------------------|
| Distribution | Uneven (depends on key distribution) | Even |
| Range queries | Efficient (single partition) | Inefficient (scatter-gather) |
| Hotspot risk | High (sequential keys) | Low (unless extreme skew) |
| Rebalancing | Split/merge ranges | Consistent hashing or fixed partitions |
| Natural fit | Time-series, geographic, sequential data | Random access, uniform distribution |

## Failure Modes

- **Shard exhaustion**: You started with 10 shards. Data grew 100×. Each shard is now 10× too large. Adding shards requires a painful, risky data migration. Prevention: start with more partitions than you think you need (CockroachDB automatically splits ranges, avoiding this).

- **Cross-shard query explosion**: After sharding by `user_id`, a new feature requires queries by `product_id`. Every such query hits all shards. Latency and cost spike. Prevention: design shard keys around the most critical access patterns. If multiple patterns need efficient access, consider secondary indexes (global or local) or a separate read-optimized view.

- **Cascade failure during rebalancing**: A node fails, its partitions are redistributed to surviving nodes. The surviving nodes are now overloaded, causing them to fail too. Domino effect. Prevention: N+2 redundancy (survive two simultaneous failures), rebalancing rate limits, circuit breakers.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Request Routing"
        User[User Request] --> LB[Load Balancer / Proxy]
        LB --> Router{Shard Router}
    end

    subgraph "Sharded Database Cluster"
        Router -->|hash(user_id) % 3 = 0| Shard1[Shard 1: Users A-G]
        Router -->|hash(user_id) % 3 = 1| Shard2[Shard 2: Users H-P]
        Router -->|hash(user_id) % 3 = 2| Shard3[Shard 3: Users Q-Z]
    end

    subgraph "Cross-Shard Query (Anti-Pattern)"
        Router -.->|Scatter-Gather| Shard1
        Router -.->|Scatter-Gather| Shard2
        Router -.->|Scatter-Gather| Shard3
        Shard1 & Shard2 & Shard3 --> Merge[Merge Results]
    end

    style Shard1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Shard2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Shard3 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Shard Size**: Aim for **100GB - 500GB** per shard. Larger shards make backups, restores, and rebalancing operationally painful.
- **Shard Key Cardinality**: Your shard key should have **high cardinality** (millions of values). Sharding by `country` (low cardinality) leads to massive, un-splittable hotspots.
- **Scatter-Gather Penalty**: A query that hits all shards is limited by the **slowest shard (p99 of p99)**. If you have 100 shards, the probability of one being slow is nearly 100%.
- **Rebalancing Overhead**: Moving 1TB of data over a 10Gbps network takes **~15-20 minutes** under ideal conditions, but realistically **1-2 hours** due to disk I/O and application traffic.

## Real-World Case Studies

- **Instagram (Manual Sharding)**: Instagram famously shards its Postgres database using a custom logic in the application layer. They use a **Logical Sharding** approach where 1,000s of logical shards are mapped to a smaller number of physical database instances, allowing them to move shards between servers easily as they grow.
- **Pinterest (MySQL Sharding)**: Pinterest sharded its MySQL fleet early on. They use a **64-bit ID** where the first few bits represent the shard ID. This allows the application to know exactly which database to query just by looking at the object ID, eliminating the need for a centralized lookup table or router.
- **Vitess (YouTube's Sharding)**: YouTube built **Vitess** to manage the sharding of its massive MySQL deployment. Vitess provides a SQL proxy that handles sharding, routing, and even cross-shard transactions, allowing developers to write SQL as if they were targeting a single database while Vitess handles the complexity of 100s of shards under the hood.

## Connections

- [[01-Phase-1-Foundations__Module-04-Databases__Database_Replication]] — Replication and partitioning are orthogonal; each partition is typically replicated for fault tolerance
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Consistent_Hashing]] — The hash ring algorithm that minimizes data movement when nodes are added/removed
- [[01-Phase-1-Foundations__Module-04-Databases__SQL_vs_NoSQL_Decision_Framework]] — Partitioning capabilities differ dramatically between databases
- [[01-Phase-1-Foundations__Module-04-Databases__Indexing_Deep_Dive]] — Local vs global secondary indexes on partitioned data
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Two-Phase_Commit]] — Cross-partition transactions require distributed coordination
- [[01-Phase-1-Foundations__Module-04-Databases__NewSQL_and_Globally_Distributed_Databases]] — Automatic range partitioning with Raft-based replication
- [[01-Phase-1-Foundations__Module-07-ID-Generation__ID_Generation_Strategies]] — ID design (sequential vs random, embedded partition key) directly affects partition balance

## Reflection Prompts

1. You're sharding a `messages` table for a chat application. Messages are accessed by conversation: "get all messages in conversation X, sorted by time." You're choosing a shard key. Options: `message_id` (random UUID), `conversation_id`, or `(conversation_id, created_at)`. Walk through the implications of each for write distribution, read efficiency, and hotspot risk (consider: group chats with 10,000 members).

2. Your DynamoDB table is partitioned by `user_id`. A new analytics feature needs to query `SELECT COUNT(*) FROM events WHERE event_type = 'purchase' AND date > '2024-01-01'`. This requires scanning every partition. The table has 500 partitions. What are your options to make this query fast without changing the partition key?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 6: "Partitioning" is the essential reference; covers range, hash, compound keys, rebalancing, and secondary indexes
- *Database Internals* by Alex Petrov — Chapter 13 covers partitioning in the context of distributed databases
- Rick Houlihan, "Advanced Design Patterns for Amazon DynamoDB" (re:Invent talk) — masterclass in partition key design for DynamoDB
- *System Design Interview* by Alex Xu — consistent hashing and partitioning chapters