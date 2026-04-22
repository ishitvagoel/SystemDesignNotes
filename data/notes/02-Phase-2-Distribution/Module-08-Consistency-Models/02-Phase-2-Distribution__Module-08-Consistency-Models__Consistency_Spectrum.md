# Consistency Spectrum

## Why This Exists

"Consistency" is the most overloaded word in distributed systems. It means different things in ACID (all invariants hold after a transaction), CAP (every read returns the most recent write), and casual conversation ("the data is correct"). This note defines the precise spectrum of consistency models — from the strongest (linearizability) to the weakest (eventual consistency) — with concrete examples of what each guarantees and what can go wrong without it.

The core tension: stronger consistency requires more coordination between nodes (slower, less available). Weaker consistency requires less coordination (faster, more available) but pushes complexity to the application. There is no free lunch.

## Mental Model

Imagine a shared Google Doc with three people editing simultaneously:

**Linearizability**: Every edit appears instantly for everyone. The moment Alice types a word, Bob and Charlie see it. The document behaves as if there's only one copy. This requires constant, instant synchronization — any network delay makes it impossible.

**Sequential consistency**: Edits appear in the same order for everyone, but not necessarily instantly. Alice types "hello" and Bob types "world." Everyone eventually sees both, in the same order — but there might be a moment where Alice sees "hello" but Bob hasn't seen it yet.

**Causal consistency**: If Alice types "What's for lunch?" and Bob replies "Pizza," everyone sees the question before the answer. But if Alice and Charlie both type independent comments simultaneously, different people might see them in different orders. Causally related events are ordered; concurrent events are not.

**Eventual consistency**: Everyone eventually sees the same data, but at any given moment, different people might see different versions. Alice deletes a paragraph that Bob is still editing. Chaos ensues until the system converges.

## The Models

### Linearizability (Strongest)

Every operation appears to take effect atomically at some point between its invocation and completion. All operations are ordered in a single, global timeline that respects real-time ordering.

**What this means concretely**: If write W completes before read R begins (in real wall-clock time), R is guaranteed to see W's effect. The system behaves as if there's a single copy of the data, and all operations are serialized.

**Where it's needed**:
- **Leader election**: If two nodes both try to acquire a lock, linearizability ensures only one succeeds. Without it, split-brain is possible.
- **Unique constraints**: If two users register the same username concurrently, linearizability ensures only one succeeds.
- **Financial balances**: If a balance is $100 and two concurrent withdrawals of $80 arrive, linearizability ensures only one succeeds (not both, leaving a -$60 balance).

**Where it's provided**: Single-node databases (trivially — one copy, one timeline). Spanner (via TrueTime — see [[01-Phase-1-Foundations__Module-04-Databases__NewSQL_and_Globally_Distributed_Databases]]). ZooKeeper and etcd (via consensus — see [[02-Phase-2-Distribution__Module-09-Consensus__Consensus_and_Raft]]). DynamoDB with `ConsistentRead=true` (for single-item reads only).

**The cost**: Linearizability requires coordination between nodes. In a geo-distributed system, this means cross-region round-trips on every operation — adding 100–300ms of latency. During network partitions, linearizable systems must reject operations to preserve correctness (they choose consistency over availability — the "C" in CAP).

### Sequential Consistency

All operations are ordered in a single sequence, and each process's operations appear in the order they were issued. But the global order doesn't need to respect real-time ordering — only per-process ordering.

**The difference from linearizability**: Linearizability says "if W finishes before R starts in real time, R sees W." Sequential consistency says "each process sees operations in a consistent order that respects its own operation ordering, but different processes' operations can be interleaved arbitrarily."

**In practice**: Sequential consistency is rarely the explicit target in system design. It's more of a theoretical model. Systems either provide linearizability (strong) or causal/eventual consistency (weaker). But it's useful to understand the distinction — it demonstrates that "consistent ordering" and "real-time ordering" are different properties.

### Causal Consistency

If event A causally precedes event B (A → B in the happens-before relation from [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]]), then everyone sees A before B. Concurrent events (neither caused the other) can be seen in any order by different observers.

**What this means concretely**: If Alice posts a photo and Bob comments on it, everyone sees the photo before the comment. But if Alice and Charlie post photos independently at the same time, some people might see Alice's first and others might see Charlie's first.

**Why it's practically important**: Causal consistency provides the strongest guarantees that are achievable without cross-node coordination (in a partition-tolerant system). It preserves the "makes sense" property — you never see an effect without its cause. And it can be implemented efficiently using vector clocks or similar mechanisms without a central coordinator.

**Where it's provided**: Some research systems and specialized databases. COPS (2011 paper). MongoDB reads within a causally consistent session (since v3.6). In practice, most systems provide something weaker (eventual) and rely on the application to handle ordering.

### Eventual Consistency

If no new writes occur, all replicas will *eventually* converge to the same value. There's no bound on how long "eventually" takes — it could be milliseconds or hours.

**What this means concretely**: After a write, some replicas might return the old value for a while. Different readers might see different values at the same time. The system guarantees convergence — not when.

**Where it's used**: DynamoDB (default), Cassandra (tunable, but default is eventually consistent), S3 cross-region replication, DNS, most caching layers.

**What can go wrong**:
- A user updates their email. The next page load reads from a stale replica and shows the old email. The user updates again, confused. Now there are three versions floating around.
- A counter is incremented on two replicas simultaneously. Both read `5`, both write `6`. The counter should be `7` but converges to `6`. (This is the lost update problem, solvable with CRDTs — see [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Replication_Deep_Dive]].)
- An item is added to a shopping cart on one replica and removed on another. Depending on convergence order, the item might reappear after being removed.

**Eventual consistency is not chaos**: It's a well-defined guarantee — convergence is guaranteed. The challenge is that the convergence window can expose inconsistencies that break user expectations. The application must be designed to tolerate or mask these inconsistencies.

## The Spectrum Summarized

| Model | Ordering Guarantee | Coordination Required | Availability During Partition | Latency Impact |
|-------|-------------------|----------------------|-------------------------------|----------------|
| Linearizability | Global real-time | High (cross-node sync) | Low (must reject operations) | High |
| Sequential | Per-process + global total order | Medium | Medium | Medium |
| Causal | Causal ordering preserved | Low (vector clocks) | High | Low |
| Eventual | Convergence guaranteed, no ordering | None | Highest | Lowest |

## Choosing the Right Model

**Don't default to the strongest model.** Linearizability is the easiest to reason about but the most expensive. Most systems use a mix:

- **Linearizable for coordination**: Leader election, unique constraints, distributed locks. A small number of critical operations that require absolute correctness.
- **Causally consistent for user-facing operations**: Ensures users see a sensible view of the world without the latency cost of linearizability.
- **Eventually consistent for everything else**: Caches, analytics, counters, logs, anything where temporary staleness is acceptable.

**The practical question**: For each piece of data, ask "what's the worst that happens if a reader sees stale data for 5 seconds?" If the answer is "nothing serious" (a dashboard shows yesterday's count, a product listing shows a stale price), eventual consistency is fine. If the answer is "we double-charge a customer" or "two nodes both think they're the leader," you need stronger consistency.

## Trade-Off Analysis

| Consistency Level | What Client Sees | Coordination Cost | Latency | Best For |
|------------------|-----------------|-------------------|---------|----------|
| Linearizable | Real-time ordering — latest write visible instantly | Highest — requires quorum or leader | High — cross-node coordination per op | Leader election, distributed locks, counters |
| Sequential | All clients see same order (not necessarily real-time) | High — total ordering | High | Replicated state machines, Raft logs |
| Causal | Cause always precedes effect; concurrent ops may differ | Moderate — track dependencies | Moderate | Social media feeds, collaborative editing |
| Read-your-writes | Client sees its own writes immediately | Low — session affinity | Low | User-facing apps, form submissions |
| Monotonic reads | Never see older data than previously read | Low — session tracking | Low | Dashboards, paginated results |
| Eventual | Converges "eventually" — no ordering guarantees | None | Lowest | DNS, CDN caches, analytics counters |

**Pick the weakest consistency your use case tolerates**: Stronger consistency is always more expensive (latency, throughput, availability). A shopping cart works fine with eventual consistency. An inventory decrement before checkout needs linearizable. Most applications have a mix — the skill is identifying which operations need which level and not over-paying.

## Failure Modes

**Assuming eventual means immediate**: A team configures eventual consistency and expects reads to see writes within milliseconds. Under load, replication lag extends to seconds or minutes. Users see stale data for extended periods, causing support tickets. Solution: define and monitor a replication lag SLO (e.g., p99 < 1 second), alert when lag exceeds acceptable bounds, and route consistency-sensitive reads to the primary.

**Consistency level mismatch across services**: Service A writes with strong consistency, but service B reads the same data from an eventually consistent replica. B makes decisions based on stale data, violating the consistency guarantee that A's callers expect. Solution: document the consistency level of each data access path, ensure downstream consumers understand the staleness window, and use consistent read endpoints for correctness-critical paths.

**Linearizability overhead on every read**: A team enables linearizable reads for all queries, paying quorum overhead on every request. 95% of reads don't need this guarantee (displaying a product catalog, rendering a feed). Latency doubles for no user-visible benefit. Solution: use linearizable reads only for operations that require it (balance checks, lock acquisitions), and cheaper read levels (eventual, read-your-writes) for everything else.

**Monotonic read violations in load-balanced reads**: A load balancer round-robins read requests across replicas with different replication lag. Request 1 reads from replica A (caught up), request 2 reads from replica B (lagging). The user sees time go backward — new data disappears on the second request. Solution: session affinity to a single replica, or pass a read timestamp/LSN with each request and route to a replica that's at least that current.

## Architecture Diagram

```mermaid
graph LR
    subgraph "Strong Consistency (Linearizable)"
        C1[Client] -->|1. Write| Leader[(Raft Leader)]
        Leader -->|2. Sync| F1[(Follower A)]
        Leader -->|3. Sync| F2[(Follower B)]
        Leader -- "Success" --> C1
    end

    subgraph "Eventual Consistency"
        C2[Client] -->|1. Write| P1[(Primary)]
        P1 -- "Success" --> C2
        P1 -.->|2. Async Replication| R1[(Replica)]
        C3[Other Client] -->|3. Read| R1
    end

    style Leader fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style P1 fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Strong Consistency Tax**: Expect **2x-3x higher latency** for writes compared to asynchronous eventual consistency, as you must wait for a quorum of nodes to acknowledge.
- **Staleness Window**: In a well-tuned local network, "eventual" usually means **< 50ms**. In cross-region systems, it can be **200ms - 5s**.
- **Conflict Probability**: For most web apps, the probability of two users editing the exact same record within the same 100ms window is **< 0.01%**, which is why eventual consistency is often a safe default.
- **Read-Your-Writes**: Implementing this at the application layer (via session pinning) gives users the *illusion* of strong consistency while keeping the backend eventually consistent.

## Real-World Case Studies

- **Google Spanner (Financial Scale)**: Spanner is one of the few systems that provides **External Consistency** globally. A bank in London can transfer money to an account in New York, and Spanner's use of atomic clocks ensures that anyone reading the New York account *immediately* after the transfer sees the correct balance, regardless of which data center they hit.
- **Amazon S3 (The Migration)**: S3 was famously **Eventually Consistent** for years. If you uploaded a file and immediately listed the bucket, the file might not appear. In 2020, Amazon performed a massive engineering feat to make S3 **Strongly Consistent** for all operations, eliminating a huge source of bugs for developers who previously had to build complex retry logic.
- **Facebook (Causal Consistency)**: Facebook uses **Causal Consistency** for social interactions. If Alice posts a status and Bob replies, Alice's friends are guaranteed to see the status *before* the reply. It would be jarring to see a comment on a post that doesn't exist yet, but it's okay if Alice's friends in Japan see the post 2 seconds later than her friends in California.

## Connections

- [[02-Phase-2-Distribution__Module-08-Consistency-Models__CAP_Theorem_and_PACELC]] — The theoretical framework for understanding why you can't have strong consistency + high availability + partition tolerance simultaneously
- [[02-Phase-2-Distribution__Module-08-Consistency-Models__Session_Guarantees]] — Practical, client-visible guarantees layered on top of eventual consistency
- [[01-Phase-1-Foundations__Module-07-ID-Generation__Logical_Clocks_and_Ordering]] — The formal tools (Lamport timestamps, vector clocks) for implementing causal ordering
- [[01-Phase-1-Foundations__Module-04-Databases__Database_Replication]] — Replication topology determines which consistency models are achievable
- [[01-Phase-1-Foundations__Module-04-Databases__NewSQL_and_Globally_Distributed_Databases]] — Spanner provides external consistency (stronger than linearizability); CockroachDB provides serializable isolation
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__MVCC_Deep_Dive]] — Snapshot isolation relates to consistency — it provides a consistent point-in-time view within a single node
- [[02-Phase-2-Distribution__Module-09-Consensus__Consensus_and_Raft]] — Consensus protocols are the mechanism for achieving linearizability in a distributed system

## Reflection Prompts

1. A social media app shows a user's post count on their profile. The count is updated whenever they create a post (write) and displayed on the profile page (read). Currently, writes go to the primary and reads go to a replica with 500ms replication lag. A user creates a post and immediately views their profile — the count hasn't incremented yet. Is this a consistency problem worth solving? If so, at what level of the consistency spectrum, and what's the implementation cost?

2. You're designing a distributed lock service. Why is linearizability essential (not just sequential or causal consistency)? Construct a specific scenario where sequential consistency would allow two clients to both believe they hold the lock simultaneously.

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 9: "Consistency and Consensus" is the essential reference; covers linearizability, causal consistency, and their relationship to consensus
- Herlihy & Wing, "Linearizability: A Correctness Condition for Concurrent Objects" (1990) — the formal definition of linearizability
- Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System" (1978) — the foundation for causal ordering
- Vogels, "Eventually Consistent" (ACM Queue, 2008) — Werner Vogels' accessible essay on eventual consistency and its practical implications for system design