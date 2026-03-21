# Cache Patterns and Strategies

## Why This Exists

The fastest database query is the one you never make. Caching stores copies of frequently accessed data in a faster storage layer (memory), eliminating the need to recompute or re-fetch it. A well-designed cache can reduce database load by 90%+, cut response latency from 50ms to 1ms, and be the difference between a system that handles 1,000 QPS and one that handles 100,000 QPS.

But caching introduces a new problem: **the data now exists in two places** (cache and source of truth), and they can diverge. Cache invalidation — keeping the cache consistent with the source — is famously one of the two hard problems in computer science (the other being naming things). Every caching pattern makes a different trade-off between consistency, performance, and complexity.


## Mental Model

A cache is a cheat sheet. You have a thick textbook (the database) with all the answers, but looking things up takes time. So you write the most frequently needed answers on a sticky note (the cache) taped to your monitor. When someone asks a question, you check the sticky note first — if it's there (cache hit), you answer instantly. If not (cache miss), you look it up in the textbook, answer, and write it on the sticky note for next time. The hard part isn't reading or writing — it's deciding when your sticky note is wrong because the textbook has been updated (cache invalidation), and what to erase when the sticky note is full (eviction).

## The Four Core Patterns

### Cache-Aside (Lazy Loading)

The application manages the cache explicitly. On read: check cache. If hit, return cached value. If miss, read from database, write to cache, return value.

```
read(key):
    value = cache.get(key)
    if value is not None:
        return value                 # Cache hit
    value = database.get(key)
    cache.set(key, value, ttl=300)   # Populate cache
    return value

write(key, value):
    database.set(key, value)
    cache.delete(key)                # Invalidate cache
```

**Strengths**: Simple, widely understood. Only caches data that's actually read (no wasted cache space on unread data). Application has full control over cache behavior.

**Weaknesses**: First request for any key is always a cache miss (cold start). The window between `database.set` and `cache.delete` can serve stale data. If `cache.delete` fails, the cache is stale until TTL expiry.

**This is the default pattern.** If you're unsure which to use, start here.

### Read-Through

The cache itself is responsible for loading data on a miss. The application reads only from the cache; the cache reads from the database on miss.

**How it differs from cache-aside**: The loading logic lives in the cache layer, not the application. The application code is simpler — it just calls `cache.get(key)` and the cache handles everything.

**Strengths**: Application code is clean — no cache miss handling. Can be implemented at the caching infrastructure level (some caching proxies support this).

**Weaknesses**: The cache must know how to read from the database (tighter coupling). Cold start latency is the same as cache-aside.

### Write-Through

On every write, the application writes to the cache, and the cache synchronously writes to the database. The cache is always consistent with the database.

```
write(key, value):
    cache.set(key, value)
    database.set(key, value)     # Synchronous — cache confirms only after DB write
```

**Strengths**: Cache is never stale (writes go to both simultaneously). Reads are always fast (data is in cache from the moment it's written). Combined with read-through, gives a clean abstraction: the cache IS the database from the application's perspective.

**Weaknesses**: Every write pays both cache and database latency (higher write latency). Data that's written but never read still occupies cache space (wasteful). If the database write fails after the cache write, the cache is ahead of the database — inconsistency in the dangerous direction.

### Write-Behind (Write-Back)

On write, the application writes to the cache. The cache asynchronously flushes to the database in the background, often batching multiple writes.

```
write(key, value):
    cache.set(key, value)
    queue_for_async_write(key, value)   # Written to DB later, possibly batched
```

**Strengths**: Lowest write latency (only cache write is synchronous). Batching reduces database write load (10 individual writes become one batch write). Absorbs write spikes — the cache acts as a buffer.

**Weaknesses**: Risk of data loss if the cache node fails before flushing to the database. Data is in the cache but not yet durable. Increased complexity (async queue, failure handling, retry logic). Ordering guarantees for writes to the same key must be maintained.

**Use case**: Write-heavy workloads where temporary data loss is acceptable (analytics counters, view counts, session data). NOT suitable for financial or transactional data.

### Pattern Comparison

| Pattern | Read Latency | Write Latency | Consistency | Data Loss Risk | Complexity |
|---------|-------------|---------------|-------------|----------------|------------|
| Cache-aside | Miss: slow, Hit: fast | Low (DB only, invalidate cache) | Eventual (TTL-bounded) | None | Low |
| Read-through | Miss: slow, Hit: fast | N/A (read pattern) | Eventual (TTL-bounded) | None | Medium |
| Write-through | Always fast | Higher (cache + DB) | Strong (synchronous) | None | Medium |
| Write-behind | Always fast | Lowest (cache only) | Eventual (flush interval) | Yes (cache failure) | High |

## Cache Invalidation Strategies

### TTL (Time-To-Live)

Every cached entry expires after a fixed duration. Simple and effective as a safety net — even if active invalidation fails, stale data is bounded by the TTL.

**Setting TTL**: Balance between freshness and cache hit ratio. 5 minutes = reasonable for most data. 60 seconds = near-real-time. 24 hours = for rarely-changing data (configuration, feature flags). The right TTL depends on how stale the data is allowed to be.

### Event-Driven Invalidation

When the source data changes, actively invalidate (or update) the cache entry. This provides near-real-time consistency without relying on TTL expiry.

**Implementation**: Database trigger or CDC ([[Change Data Capture]]) emits a change event. A consumer invalidates the cache key corresponding to the changed data. This decouples the write path from cache management.

**Trade-off**: More complex to implement. Requires reliable event delivery (if the invalidation event is lost, the cache stays stale until TTL). But provides much better freshness than TTL alone.

### Cache Stampede Prevention

When a popular cache entry expires, hundreds of concurrent requests simultaneously miss the cache and all hit the database. This can overwhelm the database — the "stampede" or "thundering herd" problem.

**Solutions**:

**Lock-based (request coalescing)**: When a cache miss occurs, the first request acquires a lock and fetches from the database. Subsequent requests for the same key wait for the lock to be released and then use the cached value. Only one request hits the database.

**Probabilistic early expiration**: Instead of all requests seeing the expiry at the same time, each request has a small random chance of refreshing the cache *before* the TTL expires. The earlier the request is (relative to the TTL), the lower the probability. This distributes recomputation over time rather than concentrating it at the expiry moment. The algorithm (XFetch) is: `should_recompute = (current_time - (ttl - delta * beta * ln(random()))) > expiry_time`.

**Background refresh**: A background process refreshes hot cache entries before they expire. The entry never actually reaches TTL; it's preemptively refreshed. Only works if you can predict which entries are "hot."

## Multi-Layer Caching

In a typical web application, data passes through multiple cache layers:

```
Browser Cache → CDN Edge → API Gateway Cache → Application Cache (Redis) → Database Buffer Pool → Disk
```

Each layer is closer to the user but further from the source of truth:

1. **Browser cache**: HTTP cache headers (`Cache-Control`, `ETag`, `Last-Modified`). Free — no server resources consumed. But you can't invalidate it (once cached by the browser, it stays until expiry or hard refresh).

2. **CDN edge cache**: Caches static assets and cacheable API responses at edge PoPs worldwide. Low latency for users, reduces origin traffic. Invalidation via purge APIs. See [[CDN Architecture]].

3. **API gateway / reverse proxy cache**: Nginx, Varnish, or gateway-level caching. Caches full HTTP responses. Effective for repeated identical requests. Requires cache-friendly URL design.

4. **Application cache** (Redis, Memcached): Caches computed results, database query results, session data. Application-controlled, fine-grained. The most flexible caching layer. See [[Distributed Caching]].

5. **Database buffer pool**: Caches data pages in memory. Transparent to the application. See [[Buffer Pool and Page Cache]].

**The multi-layer invalidation problem**: Updating a product price must invalidate the price in Redis, purge the product page from the CDN, and the browser cache is stale until its TTL expires (or the user hard-refreshes). Each layer has a different invalidation mechanism and latency. Complete end-to-end consistency across all layers is effectively impossible — you manage staleness windows at each layer.

## Trade-Off Analysis

| Pattern | Consistency | Read Latency | Write Complexity | Best For |
|---------|------------|-------------|-----------------|----------|
| Cache-aside (lazy loading) | Eventual — stale until TTL or invalidation | Miss penalty on first read | Low — app manages cache | General-purpose, read-heavy workloads |
| Read-through | Eventual — same as cache-aside | Miss penalty, but cache library handles loading | Low — cache library loads on miss | Simplified app code, consistent cache loading |
| Write-through | Strong — cache always fresh | N/A | Higher latency — must write cache + DB | Data that's read immediately after write |
| Write-behind (write-back) | Eventual — async DB write | N/A | Complex — risk of data loss if cache crashes | Write-heavy workloads, buffering bursty writes |
| Refresh-ahead | Low-latency — proactively refreshes | Consistently low for hot keys | Medium — predict access patterns | Frequently accessed keys with expensive computation |

**Cache-aside dominates for a reason**: It's the simplest pattern and works well for most read-heavy workloads. The app checks the cache, loads from the database on miss, and populates the cache. The complexity of write-through and write-behind is only justified when you have specific consistency or write-performance requirements. Start with cache-aside and only move to more complex patterns when you hit measurable pain.

## Failure Modes

- **Cache avalanche**: The cache layer goes down entirely. All traffic hits the database simultaneously. The database, sized to handle 10% of traffic (cache absorbs 90%), is overwhelmed. Mitigation: cache high availability (Redis Sentinel, Redis Cluster), circuit breaker on database calls, graceful degradation (serve stale data from a backup cache or return a degraded response).

- **Hot key problem**: One cache key receives vastly more traffic than others (a viral product, a trending topic). That key's cache shard is overwhelmed even though other shards are idle. Mitigation: replicate hot keys to multiple shards, use a local in-process cache (L1 cache) in front of the distributed cache for hot keys.

- **Cache penetration**: Queries for keys that don't exist (and never will) always miss the cache and hit the database. An attacker can exploit this by querying random non-existent IDs. Mitigation: cache negative results (`key → null` with short TTL), or use a Bloom filter to quickly reject keys that definitely don't exist.

- **Cache inconsistency on race conditions**: Thread A reads a stale value from the database. Thread B updates the database and invalidates the cache. Thread A writes the stale value to the cache. The cache is now stale even though it was just invalidated. Mitigation: use `cache.delete` on write (not `cache.set` with the old value), or use versioned cache entries.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Read Path (Cache-Aside)"
        User[Client] -->|1. Get User:123| App[Application]
        App -->|2. Check Cache| Cache{Redis}
        Cache --|Hit| Return[Return Value]
        Cache --|Miss| DB[(Primary DB)]
        DB -->|3. Fetch| App
        App -->|4. Populate| Cache
    end

    subgraph "Write Path"
        App2[Application] -->|1. Update DB| DB2[(Primary DB)]
        App2 -->|2. Invalidate| Cache2{Redis}
    end

    style Cache fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style DB fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Cache Latency**: Redis point lookup is typically **< 1ms**. Database lookup is **10ms - 100ms**.
- **Cache Hit Ratio**: Aim for **> 80%**. A hit ratio below 50% often means the cache is providing little value for the added complexity.
- **TTL Defaults**: Use **short TTLs (1-5 mins)** for rapidly changing data and **long TTLs (24h+)** for static configuration or media metadata.
- **Object Size**: Keep cached objects **< 100KB**. Large objects in Redis can cause network saturation and increased garbage collection pauses in the app.

## Real-World Case Studies

- **Facebook (Memcached at Scale)**: Facebook uses one of the world's largest Memcached deployments. They famously use **Leases** to solve the "Thundering Herd" and "Stale Set" problems, ensuring that only one client recomputes a cache miss at a time.
- **Netflix (EVCache)**: Netflix built **EVCache** (based on Memcached) to handle their massive global scale. They use a sidecar architecture to handle cross-region replication of cache data, allowing a user to move between AWS regions without losing their "continue watching" state.
- **Twitter (Redis for Timelines)**: Twitter uses Redis to store the pre-computed timelines for every active user. When you tweet, Twitter's "fan-out" service pushes your tweet ID into the Redis lists of all your millions of followers, enabling sub-millisecond timeline loads.

## Connections

- [[Distributed Caching]] — Redis Cluster and Memcached: the infrastructure for application-level caching
- [[CDN Architecture]] — The edge caching layer in the multi-layer caching stack
- [[Buffer Pool and Page Cache]] — The database's own internal caching layer
- [[Object Storage Fundamentals]] — Cache object storage responses to reduce egress costs and latency
- [[Database Replication]] — Read replicas are a form of caching (stale reads from replicas = cached data)
- [[Consistency Spectrum]] — Cache staleness is a form of eventual consistency

## Reflection Prompts

1. Your e-commerce site caches product details in Redis with a 5-minute TTL. A product's price changes. For the next 5 minutes, some users see the old price, some see the new price (depending on whether their cache entry has expired). Is this acceptable? How would you reduce the staleness window without overwhelming the database?

2. A cache entry that takes 2 seconds to compute (it aggregates data from 3 services) expires. In the next 100ms, 500 concurrent requests arrive for that key. Without stampede prevention, all 500 hit the backend. With a lock-based approach, 499 wait for one request to finish. The 499 requests now have 2+ seconds of added latency. Is this better or worse than the stampede? What's the optimal approach?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5 discusses caching in the context of replication and consistency
- *System Design Interview* by Alex Xu — Chapter on designing a cache system covers cache-aside, eviction, and distributed caching
- Vattani, Beck, Kuber, "Optimal Probabilistic Cache Stampede Prevention" (XFetch paper, VLDB 2015) — the probabilistic early expiration algorithm
- Redis documentation — practical reference for caching patterns, TTL management, and eviction policies