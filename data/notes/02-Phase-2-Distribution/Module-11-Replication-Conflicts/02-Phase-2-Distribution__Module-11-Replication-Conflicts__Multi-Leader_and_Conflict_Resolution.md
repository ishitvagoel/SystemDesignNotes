# Multi-Leader and Conflict Resolution

## Why This Exists

Single-leader replication forces all writes through one node. For a multi-region deployment, this means every write from a remote region pays cross-region latency (100–300ms). Multi-leader replication places a leader in each region, allowing local-latency writes everywhere. But this creates a new problem: two leaders can independently modify the same data, creating a **write conflict** that must be detected and resolved.

Multi-leader replication is the right choice when you need low-latency writes in multiple regions AND can tolerate the complexity of conflict resolution. It's the wrong choice when you can tolerate write latency from a single leader (most applications) or when conflicts would be catastrophic (financial transactions).


## Mental Model

Two office whiteboards in different cities, both considered "the official board." Employees in each office update their local board throughout the day. At the end of the day, they sync. Usually, different people wrote in different sections — no problem. But sometimes two people wrote different things in the same spot. Now you have a conflict. How do you resolve it? Keep the most recent one (last-write-wins — simple but loses data)? Keep both and let a human decide? Merge them with a rule (concatenate, take the max)? The conflict resolution strategy you choose defines the behavior of your multi-leader system — and there's no universally correct answer.

## Conflict Detection

### When Conflicts Occur

A conflict happens when two leaders modify the same record concurrently — before either has received the other's change via replication.

**Example**: User updates their profile name to "Alice Smith" on Leader A (US). Simultaneously, the same user updates their profile name to "Alice Johnson" on Leader B (EU). Both writes succeed locally. When replication delivers A's write to B and B's write to A, both leaders see a conflict: two different values for the same field.

### Detecting Conflicts with Version Vectors

A **version vector** tracks the version of each record per replica. Each replica maintains a counter for its own writes.

```
Record X:
  Leader A: version [A:3, B:2]  — A has written 3 times, last saw B's version 2
  Leader B: version [A:2, B:4]  — B has written 4 times, last saw A's version 2

Compare:
  A[A]=3 > B[A]=2, but A[B]=2 < B[B]=4
  Neither dominates → CONFLICT
```

If one version vector dominates the other (every component ≥), the dominant version supersedes — no conflict. If neither dominates (they disagree on who's ahead), the versions are concurrent and must be resolved.

This is the same comparison logic as [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]] vector clocks, applied to data versions rather than events.

## Resolution Strategies

### Last-Write-Wins (LWW)

Attach a timestamp to each write. The write with the latest timestamp wins; the other is silently discarded.

**Pros**: Simple. Deterministic (all replicas arrive at the same winner). No application logic needed.

**Cons**: **Data loss.** The "losing" write is discarded without any notification. If Alice sets her name to "Smith" and Bob (or Alice from another device) sets it to "Johnson" at nearly the same time, one update vanishes. There's no merge, no notification, no audit trail of the lost write.

**Timestamp reliability**: LWW depends on clocks. If Leader A's clock is 1 second ahead, A's writes always win over B's concurrent writes — even if B's were "actually" later. NTP skew makes LWW subtly unfair.

**When it's acceptable**: Data where the latest update is genuinely the only one that matters and earlier concurrent values have no business significance. User preferences, session data, cursor position. NOT acceptable for: counters, account balances, inventory, or anything where both concurrent writes carry meaningful information.

### LWW: A Concrete Data Loss Scenario with Numbers

A global e-commerce platform uses DynamoDB Global Tables (multi-region, LWW) for shopping carts. A user in Tokyo adds item `SKU-A` to their cart at timestamp `T=1000ms` (Tokyo region clock). Simultaneously, the same user on a different device in Frankfurt adds item `SKU-B` at timestamp `T=1002ms` (Frankfurt region clock). Frankfurt's timestamp is 2ms later. Under LWW, the cart state converges to the Frankfurt write. `SKU-A` is silently discarded — no error, no notification. The user ends up with a cart containing only `SKU-B`. The product team discovers this three weeks later when users report "items disappearing from my cart."

The clock skew amplifier makes this worse. NTP provides ±10–50ms accuracy between nodes on different continents. If Tokyo's clock is 50ms ahead of Frankfurt's, Tokyo's write (`T=1000ms`) will beat Frankfurt's (`T=1002ms`) even if Frankfurt's write happened at a later real-world time. The "winner" is determined by clock drift, not user intent. At scale: a platform with 10,000 concurrent cart modifications per second, where 0.01% experience concurrent writes to the same cart, generates approximately 1 lost cart item per second — 86,400 per day — with zero error logs. The silence is the worst part: LWW data loss is invisible until someone notices missing data and traces it back.

### Application-Level Merge

The application provides a custom merge function that combines conflicting versions:

- **Text fields**: Show both values to the user and let them choose (Google Docs conflict dialog).
- **Sets**: Union the two sets (add-wins semantics). If A added item X and B added item Y, the merged result contains both.
- **Counters**: Use a CRDT counter ([[02-Phase-2-Distribution__Module-11-Replication-Conflicts__CRDTs]]) that merges by taking the max per-replica counter.
- **JSON documents**: Deep merge with field-level conflict detection.

**Pros**: No data loss. Application-specific semantics can be preserved.

**Cons**: Application complexity. Every data type needs its own merge logic. Merge functions must be commutative and associative (order shouldn't matter).

### Conflict-Free Resolution (CRDTs)

Design the data structure so that all concurrent operations automatically merge without conflicts. This is the subject of [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__CRDTs]] — the most elegant solution but limited to specific data types.

### OT vs CRDTs: When to Use Which

Operational Transform (OT) and CRDTs both appear in the trade-off table as "no data loss, deterministic." They are not interchangeable — they solve different problems.

OT is designed for sequential text editing with preserved intent. When two concurrent edits arrive — insert `"hello"` at position 5 and delete the character at position 3 — OT transforms each operation to account for the other's effect before applying them, preserving the intent of both. The mechanism works, but it requires a central server to serialize the order in which operations are transformed. Without a central serialization point, implementing OT correctly across more than two concurrent editors is extremely complex (this was the original motivation for developing CRDTs). Google Docs uses OT with a central server as the single source of transform order.

CRDTs work without coordination, but only for *commutative* data types. A G-Counter (grow-only counter) merges two concurrent increments by taking the per-replica max — `{A: 5, B: 3}` merges to counter value 8 — because addition is commutative. An OR-Set (Observed-Remove Set) handles concurrent adds and removes by tracking the identity of each operation. These merge automatically and deterministically, with no server required. The constraint: CRDTs cannot represent operations where order matters. "Move the cursor to position 5" is not commutative with respect to a concurrent insertion — the cursor's correct position after the merge depends on where the insertion landed.

The practical rule: if your conflict lives on a data type with a mathematically convergent merge (counters, sets, maps with last-value-per-key, registers), use a CRDT. If your conflict requires preserving the sequential intent of operations on a shared mutable structure (text documents, ordered lists), use OT with a serialization server — and accept that server as a coordination dependency.

### Manual Resolution

Store all conflicting versions ("siblings" in Riak terminology). Present them to the user or an operator for manual resolution.

**Pros**: No data loss, no incorrect automatic resolution.

**Cons**: Terrible user experience if conflicts are frequent. Operational burden if conflicts require admin intervention. Siblings can accumulate if not resolved, causing storage bloat.

## Multi-Leader in Practice

### Database Support

- **Postgres BDR** (Bi-Directional Replication, by 2ndQuadrant/EDB): Multi-leader Postgres with LWW or custom conflict resolution. Commercial product.
- **MySQL Group Replication**: Multi-leader with conflict detection at the certification stage (before commit). Conflicting transactions are rolled back.
- **CouchDB**: Multi-leader by design. Stores conflicting revisions and presents them to the application for resolution.
- **DynamoDB Global Tables**: Multi-region, multi-leader. Uses LWW for conflict resolution (with region-level timestamps).

### Topology Considerations

**All-to-all**: Every leader replicates to every other leader. Most common. N leaders = N×(N-1) replication streams.

**Circular**: Each leader replicates to the next in a ring. Simpler, but a single leader failure breaks the ring.

**Star**: One "hub" leader receives from all and replicates to all. The hub is a bottleneck but simplifies conflict detection.

**The replication loop problem**: If Leader A's write is replicated to B, and B replicates it back to A, an infinite loop occurs. Prevention: tag each write with its origin leader ID; ignore writes that originated from yourself.

## Trade-Off Analysis

| Conflict Resolution Strategy | Data Loss Risk | Complexity | Deterministic | Best For |
|-----------------------------|---------------|------------|---------------|----------|
| Last-writer-wins (LWW) | High — silently drops concurrent writes | Trivial — timestamp comparison | Yes | Immutable events, cache updates, low-conflict data |
| Custom merge function (app-level) | None if implemented correctly | High — domain-specific logic | Yes | Business-critical data with known conflict patterns |
| CRDTs (conflict-free replicated data types) | None — mathematically convergent | Medium — limited data structures | Yes | Counters, sets, text editing, collaborative apps |
| Operational transform (OT) | None | Very high — correctness is hard | Yes | Real-time text editing (Google Docs) |
| Manual resolution (conflict queue) | None — human decides | Low technically, high operationally | No — requires human | Rare conflicts, high-value records (medical, legal) |

**LWW is a silent data destroyer**: In a multi-leader setup with LWW, if two users update the same record in different regions at the same time, one update is silently discarded. No error, no notification. Most teams don't discover this until they find missing data in production. If your data matters, you need either CRDTs, application-level merge, or a conflict detection mechanism that at least alerts you.

## Failure Modes

**Silent data loss with LWW**: Two users update the same record in different regions simultaneously. Last-writer-wins keeps one update and discards the other — silently, without any error or notification. The losing user's changes vanish. Discovery happens days later when someone notices missing data. Solution: detect concurrent writes using vector clocks or version vectors, and surface conflicts for explicit resolution rather than silently dropping one.

**Conflict resolution function bugs**: A custom merge function has a bug that produces invalid state (e.g., merging two shopping carts drops items from both, or a counter merge double-counts). The bug is replicated to all nodes before discovery. Solution: extensive testing of merge functions with property-based testing (QuickCheck-style), formal verification for critical merge logic, and the ability to replay and re-merge from the event log.

**Replication topology cycles**: In a mesh multi-leader topology, an update from node A reaches node B directly and also via node C. Without proper deduplication, the update is applied twice. Solution: tag each event with a globally unique origin ID, and skip events that have already been applied (deduplication by event ID).

**Schema divergence across leaders**: Leader A applies a schema migration that leader B hasn't received yet. A's replication stream contains data in the new format. B can't deserialize it, and replication breaks. Solution: make schema changes backward-compatible, deploy schema changes to all leaders before writing data in the new format, and use a schema registry that all leaders consult.

**Conflict storm during network heal**: After a long partition, two leaders have accumulated thousands of conflicting updates. When the partition heals, the conflict resolution process runs for all of them simultaneously, potentially overwhelming the system. Solution: throttle conflict resolution, process conflicts in batches with back-pressure, and prioritize newer conflicts over older ones.

## Architecture Diagram

```mermaid
graph LR
    subgraph "Region: US-East"
        U1[User A] --> L1[Leader A]
        L1[(US Data)]
    end

    subgraph "Region: EU-West"
        U2[User B] --> L2[Leader B]
        L2[(EU Data)]
    end

    L1 <-->|Bi-Directional Async Sync| L2

    subgraph "Conflict Resolution (Version Vectors)"
        L1 -- "Sync Y" --> L1
        L2 -- "Sync X" --> L2
    end

    style L1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style L2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Write Latency**: Multi-leader provides **Local RTT** writes (~1ms-5ms) in all regions, vs. **Cross-Region RTT** (~100ms-300ms) for single-leader.
- **Conflict Probability**: In most social/collaborative apps, concurrent writes to the *same record* occur in **< 0.01%** of cases.
- **LWW Clock Skew**: If using Last-Writer-Wins, assume a clock drift of **~10ms-50ms**. Any writes within this window are effectively "randomly ordered."
- **Topology Overhead**: An All-to-All topology with N leaders requires **N * (N-1)** replication links. For 10 regions, that's 90 links—too complex for most. Stick to 3-5 regions.

## Real-World Case Studies

- **Amazon (DynamoDB Global Tables)**: DynamoDB provides a managed multi-leader service. It uses **Last-Writer-Wins (LWW)** based on the timestamp when the write reaches the regional endpoint. This makes it incredibly fast and easy to use, but Amazon warns developers that if two regions update the same item concurrently, only one will persist.
- **CouchDB (Multi-Version Document)**: CouchDB is a multi-leader database that never throws away data during a conflict. Instead, it creates **Siblings** (multiple versions of the same document). When you read the document, CouchDB returns all siblings, and the *application* must decide how to merge them and write back a resolved version.
- **Facebook (Cassandra for Inbox Search)**: Facebook used Cassandra (leaderless/multi-leader) for their original Inbox Search. They found that for a search index, LWW was acceptable because a slightly out-of-order index update wouldn't break the user experience, but the high write availability across regions was critical for real-time indexing.

## Connections

- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Replication_Deep_Dive]] — Single-leader replication avoids conflicts entirely by funneling all writes through one node
- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Leaderless_Replication]] — Leaderless systems face similar conflict issues, resolved via read-repair and anti-entropy
- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__CRDTs]] — The conflict-free alternative to manual resolution
- [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]] — Version vectors are the mechanism for detecting concurrent writes
- [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Geo-Distribution_and_Data_Sovereignty]] — Multi-leader is primarily motivated by multi-region deployment

## Reflection Prompts

1. Your globally distributed application uses DynamoDB Global Tables (multi-leader, LWW). A customer in Tokyo and a customer in Frankfurt both add items to the same shared shopping cart within the same second. The Tokyo write has a slightly later timestamp. What happens to the Frankfurt customer's item? How would you redesign the cart data model to prevent this data loss?

2. You're evaluating multi-leader Postgres (BDR) vs CockroachDB (single-logical-leader per range, Raft-replicated) for a multi-region application. Both support multi-region writes. What are the fundamental differences in how they handle concurrent writes to the same row? Which approach is safer, and what does "safer" cost?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5: "Replication" covers multi-leader replication, conflict detection, and resolution strategies in depth
- Shapiro et al., "Conflict-Free Replicated Data Types" (2011) — the foundational CRDT paper
- DynamoDB Global Tables documentation — practical reference for multi-region LWW replication