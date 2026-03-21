# Distributed Caching

## Why This Exists

A single cache server has limits — memory capacity (one machine's RAM) and throughput (one machine's network and CPU). When your cache needs to hold 500GB of data or serve 1 million requests per second, you need to distribute it across multiple nodes. Distributed caching is the infrastructure layer that makes the caching patterns from [[Cache Patterns and Strategies]] work at scale.


## Mental Model

A single sticky note on your desk is a local cache. A distributed cache is a shared whiteboard in the team room — everyone on the team can read from it and write to it. When the whiteboard gets too full, you add more whiteboards (sharding). The challenge is that everyone needs to agree on which whiteboard has which answers (consistent hashing), the whiteboards need to stay in sync if you make copies for reliability (replication), and the whole team suffers if someone erases the whiteboard by accident (cache stampede).

## Redis vs Memcached

These two dominate the distributed caching landscape. They solve the same core problem but with different philosophies.

### Memcached

Pure key-value cache. Simple. Fast. No persistence, no data structures — just `get`, `set`, `delete` on string keys and values.

**Architecture**: Multi-threaded (uses all CPU cores efficiently). No built-in clustering — clients hash keys to nodes using consistent hashing. If a node dies, its keys are gone; the client routes to a different node (cache miss, not an error).

**Strengths**: Simplicity. Predictable performance. Multi-threading means a single Memcached node can fully saturate modern hardware. No disk I/O (pure memory), no background processes.

**Weaknesses**: No persistence. No data structures (can't do sorted sets, lists, counters natively). No pub/sub. No replication — a node failure means cold cache for its keys. Limited value size (1MB default).

**Best for**: Simple key-value caching where you just need raw speed and don't need persistence or data structures. Large-scale web caching (Facebook used Memcached at massive scale for years).

### Redis

Data structure server with caching capabilities. Supports strings, hashes, lists, sets, sorted sets, streams, bitmaps, HyperLogLogs, and more.

**Architecture**: Single-threaded for command execution (simplifies concurrency — no locks needed). Uses I/O multiplexing (epoll) for network handling. Redis 6+ offloads I/O to multiple threads, but command execution remains single-threaded.

**Strengths**: Rich data structures (sorted sets for leaderboards, HyperLogLog for cardinality estimation, streams for event logs). Persistence options (RDB snapshots, AOF append-only file). Built-in replication. Pub/sub. Lua scripting for atomic multi-step operations. Redis Cluster for native sharding.

**Weaknesses**: Single-threaded command execution means one slow command (KEYS *, large SORT) blocks everything. Memory overhead per key is higher than Memcached (Redis stores metadata for each data structure). More operational complexity.

**Best for**: Anything beyond simple key-value caching. Session storage, rate limiting ([[Rate Limiting and Throttling]]), distributed locks, leaderboards, pub/sub, real-time analytics.

### Comparison

| Dimension | Memcached | Redis |
|-----------|-----------|-------|
| Data structures | Strings only | Strings, hashes, lists, sets, sorted sets, streams, etc. |
| Threading | Multi-threaded | Single-threaded execution (I/O threads in v6+) |
| Persistence | None | RDB + AOF |
| Replication | None (client-side) | Built-in leader-follower |
| Clustering | Client-side consistent hashing | Redis Cluster (native) |
| Max value size | 1MB | 512MB |
| Memory efficiency | Higher (simpler per-key overhead) | Lower (data structure metadata) |

## Redis Cluster

Redis Cluster provides automatic sharding across multiple Redis nodes with built-in failover.

**How it works**: The key space is divided into **16,384 hash slots**. Each key is hashed (`CRC16(key) mod 16384`) to a slot. Slots are distributed across master nodes. Each master has one or more replicas for failover.

**Client-side routing**: The client sends a command to any node. If that node doesn't own the slot for the requested key, it returns a `MOVED` redirect to the correct node. Smart clients (Jedis, Lettuce, ioredis) learn the slot-to-node mapping and route directly, avoiding redirects.

**Resharding**: Moving slots between nodes is done online. Redis migrates keys belonging to the slot, one at a time, redirecting requests to the new owner as each key moves.

**Limitations**:
- **Multi-key operations** must target keys in the same slot. `MGET key1 key2` fails if `key1` and `key2` hash to different slots. Workaround: hash tags — `{user:123}:profile` and `{user:123}:settings` both hash based on `user:123`, guaranteeing the same slot.
- **No cross-slot transactions**: `MULTI/EXEC` works only within a single slot. Lua scripts similarly must operate on keys in the same slot.
- **Write scalability**: Writes for a given slot go to exactly one master. If one slot is hot (a single key receives massive write traffic), that master is the bottleneck. Redis Cluster doesn't shard within a slot.

## Cache Sharding with Consistent Hashing

For systems not using Redis Cluster's native sharding (e.g., Memcached, or Redis in non-cluster mode), clients distribute keys across nodes using [[Consistent Hashing]].

**Why not simple modular hashing** (`node = hash(key) % num_nodes`)? When you add or remove a node, `num_nodes` changes, and *every* key's assigned node changes. The entire cache is effectively invalidated — a cold start that can overwhelm the database.

**Consistent hashing**: Nodes and keys are mapped onto a hash ring. Adding a node only remaps keys in its immediate vicinity — typically ~1/N of all keys (where N is the number of nodes). The rest stay on their current nodes. See [[Consistent Hashing]] for the full mechanism.

**Virtual nodes**: Each physical node is represented by multiple points on the ring. This smooths out distribution (preventing one node from getting a disproportionate range) and allows weighted assignment (a node with more memory gets more virtual nodes).

## Operational Concerns

### Memory Management and Eviction

When the cache is full, which entries are evicted?

**Redis eviction policies**:
- `noeviction`: Return errors on writes when memory is full. Safe but disruptive.
- `allkeys-lru`: Evict the least recently used key from all keys. The most common choice for caching.
- `volatile-lru`: Evict LRU only from keys with a TTL set. Keys without TTL are never evicted.
- `allkeys-lfu`: Evict the least frequently used key. Better than LRU for workloads with a stable hot set.
- `volatile-ttl`: Evict keys with the shortest remaining TTL first.

**Sizing**: The cache should be large enough to hold the working set (the frequently accessed data). If your working set is 50GB and your cache is 10GB, the hit ratio will be poor regardless of eviction policy. Monitor hit ratio — below 90% often means the cache is undersized.

### Cache Warming

A cold cache (empty after restart or failover) means every request is a miss, hitting the database. For high-traffic services, this cold-start period can overwhelm the database.

**Strategies**:
- **Passive warming**: Accept the misses and let the cache fill naturally. Works if the database can handle the temporary load spike.
- **Active warming**: On startup, preload the cache from the database with known hot keys. Requires knowing which keys are hot (log analysis, or a snapshot of the previous cache's key space).
- **Cache persistence** (Redis RDB/AOF): Restart Redis with its data intact. Recovery time depends on data size, but avoids the cold start entirely.

## Trade-Off Analysis

| System | Data Structures | Clustering | Persistence | Best For |
|--------|----------------|------------|-------------|----------|
| Redis (standalone) | Rich — strings, hashes, sorted sets, streams | No — single node | RDB snapshots, AOF | Small datasets, development, feature flags |
| Redis Cluster | Same | Hash-slot-based sharding, auto-failover | Same | Large datasets, horizontal scale, production |
| Redis Sentinel | Same | Primary-replica with auto-failover, no sharding | Same | HA without sharding, moderate scale |
| Memcached | Simple — key-value only, no types | Client-side consistent hashing | None | Pure caching, large values, multi-threaded |
| KeyDB | Redis-compatible, multi-threaded | Compatible with Redis Cluster protocol | Same as Redis | Drop-in Redis replacement needing more throughput per node |

**Redis vs Memcached in 2024**: Redis wins for almost all use cases because of its data structures (sorted sets for leaderboards, streams for event logs, hashes for objects). Memcached's only remaining advantage is multi-threaded architecture on a single node — but KeyDB and Dragonfly now bring multi-threading to the Redis protocol. Choose Memcached only if you're already running it and have no reason to migrate.

## Failure Modes

**Thundering herd on cache miss**: A popular cache key expires. Hundreds of concurrent requests all miss the cache simultaneously and hit the database. The database, sized for 10% of total load, is overwhelmed. Solution: cache stampede protection — use a lock so only one request rebuilds the cache, others wait for the result (or serve stale data).

**Hot key overload on single shard**: In a sharded cache (Redis Cluster), one key receives disproportionate traffic (a viral product page, a trending topic). The shard holding that key is saturated while others are idle. Solution: replicate hot keys to multiple shards with a random suffix (`hot_key:0`, `hot_key:1`), use an L1 in-process cache for the hottest keys, or use Redis's read replicas per shard.

**Cache inconsistency during deployments**: During a rolling deployment, old instances write cache entries in the old format and new instances expect the new format. Deserialization failures or silent data corruption occur. Solution: version cache keys (`v2:user:123`), or use a serialization format with backward compatibility (Protobuf, Avro).

**Redis memory exhaustion**: Redis is configured without a `maxmemory` limit or with an inappropriate eviction policy. Memory usage grows until the OS OOM-killer terminates Redis, or Redis starts evicting keys you expected to persist. Solution: set `maxmemory` explicitly, choose the right eviction policy (`allkeys-lru` for caches, `volatile-lru` for mixed workloads), and monitor memory usage with alerts at 80% threshold.

**Cross-datacenter cache coherence**: Each data center has its own cache cluster. An update invalidates the cache in DC1 but not DC2. Users routed to DC2 see stale data. Solution: cross-DC invalidation via message bus (publish invalidation events to all DCs), or accept stale reads with TTL-based eventual consistency. True cross-DC cache coherence is expensive and often unnecessary.

## Architecture Diagram

```mermaid
graph TD
    Client[Client Request] --> LB[Load Balancer]
    LB --> App1[App Server 1]
    LB --> App2[App Server 2]
    
    subgraph "Distributed Cache Ring"
        App1 -- "Hash(key) -> Node B" --> CacheB[(Cache Node B)]
        App2 -- "Hash(key) -> Node A" --> CacheA[(Cache Node A)]
        CacheC[(Cache Node C)]
    end
    
    CacheA -- "Miss" --> DB[(Primary DB)]
    CacheB -- "Miss" --> DB
    
    classDef primary fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    classDef secondary fill:var(--bg2),stroke:var(--border),stroke-width:1px;
    class Client,LB secondary;
    class App1,App2,DB primary;
    class CacheA,CacheB,CacheC primary;
```

## Back-of-the-Envelope Heuristics

- **Latency**: Redis/Memcached local network reads take **~0.5ms to 1ms**.
- **Throughput**: A single Redis node can comfortably handle **50k - 100k+ ops/sec** (depending on command complexity and payload size).
- **Memory**: A general rule of thumb is to size the cache to hold **10% to 20% of your total dataset** (aiming for the "hot" working set).
- **Hit Rate**: Aim for a **90%+ cache hit rate**. If it drops below 80%, you are either under-provisioned (cache churn) or experiencing a shift in access patterns.

## Real-World Case Studies

- **Facebook (Memcached)**: Scaled Memcached to thousands of servers holding hundreds of terabytes. They pioneered the "McRouter" architecture to solve connection pooling and scaling limits of massive Memcached clusters.
- **Twitter / X (Redis)**: Uses Redis heavily for timeline generation. When a user tweets, it is fanned out to the Redis lists of their followers (for users with < 100k followers), blending push (write-time) and pull (read-time) caching strategies.
- **Discord (ScyllaDB + Redis)**: Uses Redis as an L1 cache in front of ScyllaDB to handle the massive read volume of chat messages, specifically protecting the database from "hot chat" channels with thousands of active participants.

## Architecture Diagram

```mermaid
graph TD
    Client[Client Request] --> LB[Load Balancer]
    LB --> App1[App Server 1]
    LB --> App2[App Server 2]
    
    subgraph "Distributed Cache Cluster (Redis Cluster)"
        App1 -- "Slot 450 (MOVED -> Node B)" --> CacheA
        App1 -- "Slot 8000" --> CacheB[(Node B: Master)]
        App2 -- "Slot 12000" --> CacheC[(Node C: Master)]
        
        CacheB --- CacheB_Rep[(Node B: Replica)]
        CacheC --- CacheC_Rep[(Node C: Replica)]
    end
    
    CacheB -- "Miss" --> DB[(Primary DB)]
    
    style CacheB fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style CacheC fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Latency**: Redis/Memcached local network reads take **~0.5ms to 1ms**.
- **Throughput**: A single Redis node can comfortably handle **50k - 100k+ ops/sec** (depending on command complexity and payload size).
- **Memory**: A general rule of thumb is to size the cache to hold **10% to 20% of your total dataset** (aiming for the "hot" working set).
- **Hit Rate**: Aim for a **90%+ cache hit rate**. If it drops below 80%, you are either under-provisioned (cache churn) or experiencing a shift in access patterns.

## Real-World Case Studies

- **Facebook (Memcached)**: Scaled Memcached to thousands of servers holding hundreds of terabytes. They pioneered the "McRouter" architecture to solve connection pooling and scaling limits of massive Memcached clusters.
- **Twitter / X (Redis)**: Uses Redis heavily for timeline generation. When a user tweets, it is fanned out to the Redis lists of their followers (for users with < 100k followers), blending push (write-time) and pull (read-time) caching strategies.
- **Discord (ScyllaDB + Redis)**: Uses Redis as an L1 cache in front of ScyllaDB to handle the massive read volume of chat messages, specifically protecting the database from "hot chat" channels with thousands of active participants.

## Connections

- [[Cache Patterns and Strategies]] — The caching patterns that this infrastructure supports
- [[Consistent Hashing]] — The algorithm behind cache sharding in Memcached and non-cluster Redis
- [[Partitioning and Sharding]] — Cache sharding follows the same principles as database sharding
- [[Rate Limiting and Throttling]] — Redis is the standard backend for distributed rate limiting
- [[Connection Pooling and Keep-Alive]] — Connection pools to Redis are essential for high-throughput services
- [[Idempotency]] — Redis SETNX is commonly used for idempotency key deduplication

## Reflection Prompts

1. Your Redis Cluster has 6 masters, each with 2 replicas. One master fails. What happens to reads and writes for its slots during failover? How long is the disruption? What happens if a master and both its replicas fail simultaneously?

2. You're migrating from a single Redis instance (64GB) to Redis Cluster (3 masters, 32GB each = 96GB total). Your application uses `MGET` to fetch 20 user profiles in a single command. After migration, this command fails. Why, and what are your options?

## Canonical Sources

- Redis documentation, "Redis Cluster Specification" — authoritative reference for slot hashing, resharding, and failover
- Redis documentation, "Memory optimization" — practical guidance on memory management and eviction
- *System Design Interview* by Alex Xu — distributed cache design chapter covers sharding and consistent hashing
- Brad Fitzpatrick, "Distributed Caching with Memcached" (original paper) — the origin of distributed caching architecture