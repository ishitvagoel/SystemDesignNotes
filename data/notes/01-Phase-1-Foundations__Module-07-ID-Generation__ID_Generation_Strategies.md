# ID Generation Strategies

## Why This Exists

Every row, every event, every message needs a unique identifier. In a single-node system, an auto-incrementing integer works. In a distributed system with 20 service instances all creating entities simultaneously, auto-increment falls apart — who assigns the next number? A central coordinator? That's a bottleneck and a single point of failure.

The ideal distributed ID is: globally unique (no collisions without coordination), sortable by creation time (for efficient indexing and debugging), compact (small storage footprint), and generatable locally (no network call to a central service). No single format achieves all four perfectly — each makes trade-offs.


## Mental Model

Naming a baby vs. naming a star. When you name a baby, you pick something meaningful, but you have to check that no one in your family already has that name — this requires coordination. When astronomers name stars, they use a coordinate system (right ascension + declination) that guarantees uniqueness by construction — no checking needed. ID generation strategies live on this same spectrum: some require coordination (database auto-increment, centralized ticket server) and some are coordination-free (UUIDs, Snowflake IDs that encode time + machine + sequence). The trade-off is always the same: coordination gives you shorter, sortable, meaningful IDs but creates a bottleneck; coordination-free gives you independence but larger, less friendly IDs.

## The Options

### Auto-Increment Integer

`1, 2, 3, 4, ...` — the simplest possible ID.

**Strengths**: Compact (4 or 8 bytes). Sorted by creation order. Human-readable. Excellent B-tree index performance (sequential inserts always append to the rightmost leaf — no random page splits).

**Weaknesses**: Requires a single coordinator (the database sequence or auto-increment column). In a sharded database, you need per-shard sequences (shard 1: 1, 3, 5...; shard 2: 2, 4, 6...) or a central ID service. Predictable/enumerable — an attacker can guess valid IDs (`/users/1`, `/users/2`, ...). Leaks information about entity count and creation rate.

**When to use**: Single-database applications where simplicity matters and ID predictability is acceptable (internal IDs not exposed in URLs). The default for most Postgres/MySQL tables.

### UUID v4 (Random)

128-bit random value. `550e8400-e29b-41d4-a716-446655440000`.

**Strengths**: Truly coordination-free — any node can generate one independently with negligible collision probability (p(collision) < 10^-18 for billions of IDs). Universally supported. No central service needed.

**Weaknesses**: Not sortable by time. 128 bits (16 bytes) — larger than an 8-byte integer. The canonical string representation is 36 characters. **B-tree performance disaster**: Random UUIDs cause random inserts across the entire B-tree, splitting pages everywhere, destroying cache locality, and increasing write amplification. On a large table, UUIDv4 primary keys can make inserts 2–5× slower than sequential keys.

**The B-tree problem in detail**: A B-tree index is physically sorted. Auto-incrementing IDs always insert at the end — the "hot" leaf page stays in the buffer pool, and splits are rare. Random UUIDs insert at random positions — every insert potentially touches a different leaf page, evicting cached pages. The buffer pool thrashes. See [[B-Tree vs LSM-Tree]].

**When to use**: When you need coordination-free generation and don't care about sort order or index performance. Good for idempotency keys ([[Idempotency]]), distributed systems where any node must generate IDs independently, and situations where the ID is not a primary key or frequently-queried index.

### UUID v7 (Time-Sorted, RFC 9562)

128-bit ID with a Unix timestamp prefix (milliseconds) and random suffix. Standardized in RFC 9562 (2024).

`01906e7a-1234-7abc-8def-123456789abc`
`|---timestamp---|---random---|`

**Strengths**: Coordination-free (like v4). **Time-sorted** — IDs generated later have higher values. This means B-tree inserts are approximately sequential (within the same millisecond, the random suffix causes minor out-of-order inserts, but the overall pattern is append-like). Encodes creation time — you can extract the timestamp from the ID for debugging.

**Weaknesses**: Still 128 bits (16 bytes). Millisecond precision means ~1000 IDs per millisecond share the same timestamp prefix (ordering within that window is random). Clock skew between nodes can cause out-of-order IDs (node A's clock is 1 second ahead of node B — A's IDs sort after B's even for events that B processed first).

**When to use**: **The default choice for most new systems.** Combines UUIDv4's coordination-free generation with time-sorted B-tree friendliness. Use this unless you have a specific reason to choose something else.

### Snowflake ID (Twitter)

64-bit ID with three components:

```
| 41 bits: timestamp (ms since epoch) | 10 bits: machine ID | 12 bits: sequence |
```

Invented by Twitter (2010) to generate time-sorted, unique IDs at massive scale without a central coordinator.

**How it works**: Each machine has a unique machine ID (assigned via ZooKeeper or configuration). Within each millisecond, the sequence counter increments (up to 4096 IDs per ms per machine). If the counter overflows, the generator waits until the next millisecond.

**Strengths**: 64 bits (8 bytes) — fits in a BIGINT column. Time-sorted. Generates up to 4,096 IDs/ms/machine × 1,024 machines = ~4 million IDs/second globally. No external coordination during generation (machine ID is pre-assigned).

**Weaknesses**: Requires machine ID assignment (some coordination, though one-time). 41-bit timestamp overflows in ~69 years from the epoch (Twitter's epoch is 2010, so overflow in ~2079). If a machine's clock goes backward (NTP adjustment), the generator must wait or reject — clock monotonicity is critical.

**Variants**: Discord uses a similar format. Instagram uses a Postgres-function-based variant. Sony's Sonyflake uses 39 bits for timestamp (10ms precision, ~174 years) and 16 bits for machine ID.

**When to use**: When you need a 64-bit ID (compatibility with systems that don't handle 128-bit), high throughput, and time-sorted order. Good for databases that index more efficiently on BIGINT than UUID.

### ULID (Universally Unique Lexicographically Sortable Identifier)

128-bit ID encoded as a 26-character Crockford's Base32 string.

```
01ARZ3NDEKTSV4RRFFQ69G5FAV
|-------||----------------|
 48-bit    80-bit random
timestamp
```

**Strengths**: Time-sorted (like UUIDv7). String-sortable (Crockford's Base32 maintains lexicographic order). Coordination-free. More compact string representation than UUID (26 chars vs 36). Monotonic within the same millisecond (some implementations increment the random component rather than generating a new random value, ensuring strict monotonicity).

**Weaknesses**: 128 bits binary, same storage as UUID. Not a standard UUID format — some systems expect UUID format and reject ULIDs. Less widely supported in database UUID types.

**When to use**: When you want UUIDv7-like properties but prefer a cleaner string representation. Popular in JavaScript/TypeScript ecosystems.

### TSID (Time-Sorted ID)

64-bit ID inspired by Snowflake but without the machine ID assignment requirement. Uses a 42-bit timestamp + 22-bit random component.

**Strengths**: 64-bit (fits in BIGINT). Time-sorted. No machine ID coordination needed (unlike Snowflake). Higher collision resistance than Snowflake's sequence-based approach for low-throughput scenarios.

**Weaknesses**: Less throughput headroom than Snowflake (random suffix vs deterministic sequence). Less widely known.

## Comparison Table

| Format | Size | Sortable | Coordination | Throughput | B-Tree Friendly | String Length |
|--------|------|----------|-------------|------------|-----------------|---------------|
| Auto-increment | 4–8 bytes | Yes | Central DB | Unlimited (per node) | Excellent | 1–19 chars |
| UUID v4 | 16 bytes | No | None | Unlimited | Poor (random) | 36 chars |
| UUID v7 | 16 bytes | Yes (ms) | None | Unlimited | Good | 36 chars |
| Snowflake | 8 bytes | Yes (ms) | Machine ID (one-time) | ~4K/ms/machine | Excellent | 19 chars |
| ULID | 16 bytes | Yes (ms) | None | Unlimited | Good | 26 chars |
| TSID | 8 bytes | Yes (ms) | None | Limited by random space | Excellent | 13 chars |

## ID as a Coordination-Free Primitive

The deeper lesson of Snowflake and its descendants: **ID generation is a distributed systems problem, and the ID format encodes architectural decisions.**

When Twitter built Snowflake, they needed unique IDs across thousands of machines generating tens of thousands of tweets per second. The options were:

1. **Central ID service**: Simple but a SPOF and bottleneck. Every tweet creation requires a network round-trip to the ID service.
2. **Database sequences**: Requires all writes to go through a single database. Doesn't scale.
3. **Random UUIDs**: No coordination, but 128 bits (too large for their use case) and terrible for B-tree indexes.
4. **Embed enough state in the ID itself**: Time + machine + sequence = unique without coordination. This is Snowflake.

The insight: by encoding time and machine identity in the ID, you eliminate the need for runtime coordination while still guaranteeing uniqueness. The ID is a self-describing, coordination-free artifact.

## Practical Recommendations

**For most web applications**: UUID v7. It's standardized (RFC 9562), coordination-free, time-sorted, and widely supported. The 128-bit size is acceptable for modern databases.

**For high-performance / legacy systems needing 64-bit**: Snowflake or TSID. Fits in BIGINT, excellent index performance.

**For idempotency keys and correlation IDs**: UUID v4. Sort order doesn't matter; maximum randomness minimizes collision risk.

**For user-facing URLs**: Consider a shorter format (TSID, NanoID) or use a separate slug. Don't expose auto-increment IDs (enumerable, leaks entity count).

**Avoid**: UUID v1 (exposes MAC address — privacy concern, and the timestamp bits aren't in sortable position).

## Trade-Off Analysis

| Strategy | Sortability | Uniqueness Scope | Coordination Required | Size | Best For |
|----------|-----------|-----------------|---------------------|------|----------|
| Auto-increment (DB sequence) | Yes — total order | Single database | Yes — DB is the coordinator | 8 bytes | Single-database OLTP, simple schemas |
| UUID v4 (random) | No | Global (probabilistic) | None | 16 bytes | Distributed systems, no ordering need |
| UUID v7 (time-ordered) | Yes — time-based prefix | Global (probabilistic) | None | 16 bytes | Distributed systems needing sort order |
| Snowflake ID (Twitter) | Yes — timestamp + worker + seq | Global (worker IDs assigned) | Worker ID assignment | 8 bytes | High-throughput, sorted, compact IDs |
| ULID | Yes — time-ordered, lexicographic | Global (probabilistic) | None | 16 bytes (26 chars as string) | APIs needing URL-safe sortable IDs |
| KSUID | Yes — time-ordered | Global (probabilistic) | None | 20 bytes | When you need more randomness than ULID |

**B-tree fragmentation matters**: Random UUIDs (v4) as primary keys cause massive B-tree fragmentation — each insert goes to a random leaf page, destroying locality. This is measurable: write throughput can drop 2-5x compared to sequential IDs on large tables. UUID v7, ULID, and Snowflake all solve this with a time-ordered prefix that keeps recent inserts in adjacent pages.

## Failure Modes

**Snowflake worker ID collision**: Two instances of your service are assigned the same worker ID (misconfiguration, container reuse, race condition during startup). Both generate IDs with the same worker bits, producing duplicate IDs. Solution: use ZooKeeper/etcd for worker ID assignment with ephemeral nodes, or derive worker ID from a guaranteed-unique value (MAC address + PID, Kubernetes pod name).

**Clock skew in timestamp-based IDs**: A server's clock jumps backward (NTP correction, VM live migration). Timestamp-based IDs (Snowflake, UUIDv7) generate IDs with earlier timestamps than previously issued IDs, breaking sortability. Worse, combined with the same sequence counter, you could generate duplicates. Solution: detect clock regression and wait until the clock catches up (Twitter Snowflake does this), or use a monotonic clock source.

**UUID v4 index fragmentation**: Random UUIDs as primary keys scatter inserts across the entire B-tree. On a table with 100M rows, each insert touches a different leaf page, thrashing the buffer pool. Write throughput drops 5-10x compared to sequential IDs. Solution: switch to UUIDv7 or ULID (time-ordered prefix), or use auto-increment with a separate UUID column for external references.

**Sequence exhaustion in auto-increment**: A 32-bit auto-increment column overflows after ~2.1 billion rows. Inserts start failing with primary key violations. Teams discover this only when production breaks. Solution: use BIGINT (64-bit) for all auto-increment primary keys by default — 9.2 quintillion values is sufficient for any practical purpose.

**ID leaking business information**: Sequential IDs expose your growth rate (competitor creates account #1000, then #1005 a week later — you gained 5 customers). They also enable enumeration attacks (scrape all users by incrementing the ID). Solution: use UUIDs or opaque encoded IDs for external-facing identifiers. Keep sequential IDs for internal use (database performance) but never expose them in APIs.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Centralized (Coordination)"
        DB[Database Sequence] -->|Nextval| App1[App Instance A]
        DB -->|Nextval| App2[App Instance B]
    end

    subgraph "Decentralized (Snowflake)"
        Snowflake1[Snowflake Gen: Machine 1] -->|Time+M1+Seq| ID1[ID: 1582...]
        Snowflake2[Snowflake Gen: Machine 2] -->|Time+M2+Seq| ID2[ID: 1582...]
    end

    subgraph "Random (No Coordination)"
        UUID[UUID v4 Generator] -->|Random 128-bit| ID3[ID: 550e...]
    end

    style Snowflake1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style DB fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Storage Cost**: BIGINT (8 bytes) vs UUID (16 bytes). In a 1-billion row table, UUIDs consume **~8GB more** for the primary key index alone.
- **Collision Risk (UUID v4)**: To have a 50% chance of a collision, you would need to generate **~100 billion IDs per second** for 100 years. For most apps, the risk is effectively zero.
- **Snowflake Throughput**: A single Snowflake worker can typically generate **4,096 IDs per millisecond** (over 4 million per second).
- **B-Tree Fragmentation**: Using random UUID v4 as a primary key can increase write amplification by **3x-5x** on large tables compared to sequential IDs.

## Real-World Case Studies

- **Twitter (Snowflake)**: Twitter created **Snowflake** because they needed to generate unique IDs for billions of tweets across thousands of distributed processes. They needed the IDs to be roughly time-ordered so that search results could be sorted by ID rather than having to load and sort by a separate `created_at` timestamp.
- **Instagram (Sharded Postgres Sequences)**: Instagram uses a clever variant of Snowflake inside Postgres. They use a **PL/pgSQL function** that combines a custom epoch timestamp, a shard ID (from the database schema name), and a local auto-increment sequence to generate 64-bit IDs without needing an external service.
- **Shopify (UUID v7 Adoption)**: Many modern SaaS platforms like Shopify are moving toward **UUID v7**. It allows their globally distributed checkout services to generate IDs independently (no central bottleneck) while keeping database indexes efficient (time-sorted) and maintaining compatibility with standard UUID fields.

## Connections

- [[Logical Clocks and Ordering]] — Time-sorted IDs use wall-clock time, which is unreliable across nodes. Logical clocks provide ordering guarantees that wall clocks can't.
- [[B-Tree vs LSM-Tree]] — ID format directly impacts storage engine performance. Random IDs degrade B-trees; LSM-trees are more tolerant.
- [[Partitioning and Sharding]] — IDs are often used as partition keys. Time-sorted IDs can cause write hotspots (all recent writes go to the same partition). Random IDs distribute evenly.
- [[Indexing Deep Dive]] — Primary key index performance depends heavily on ID sort characteristics.
- [[Idempotency]] — UUID v4 is the standard for idempotency keys.
- [[NewSQL and Globally Distributed Databases]] — CockroachDB uses UUIDs for primary keys by default; Spanner uses application-chosen keys with strong guidance against monotonically increasing keys (hotspot risk).

## Reflection Prompts

1. You're designing a database for an IoT platform ingesting 100,000 events per second from 50,000 devices. Events are stored in a time-series table with a B-tree primary key index. You're choosing between UUIDv4, UUIDv7, and Snowflake IDs. Walk through the B-tree impact of each at this write rate. Which do you choose, and why?

2. Your system uses auto-incrementing IDs for user accounts. A security researcher reports that they can enumerate all users by incrementing the ID in the API URL (`/api/users/1`, `/api/users/2`, ...). What are the risks? What's the cheapest fix that doesn't require changing the primary key?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 3 discusses B-tree insert performance and key design
- RFC 9562, "Universally Unique IDentifiers (UUIDs)" (2024) — the standard that defines UUID v7
- Twitter Engineering Blog, "Announcing Snowflake" (2010) — the original Snowflake ID announcement
- *System Design Interview* by Alex Xu — Chapter 7: "Design a Unique ID Generator in Distributed Systems"
- Tomas Vondra, "The Impact of UUID Versions on Postgres Performance" — benchmarks showing UUIDv4 vs UUIDv7 insert performance