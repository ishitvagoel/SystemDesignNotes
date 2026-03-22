# CAP Theorem and PACELC

## Why This Exists

The CAP theorem is the most cited — and most misunderstood — result in distributed systems. It's invoked to justify design decisions, dismiss concerns about consistency, and explain why distributed systems are hard. But most invocations get it wrong. Understanding what CAP actually says (and what it doesn't) is essential for making informed trade-off decisions. PACELC extends CAP into a more useful framework for real systems.


## Mental Model

A long-distance relationship with a shared bank account. You're in Delhi, your partner is in London. You both have debit cards to the same account with ₹10,000. The ATM network (the distributed system) has a choice when the undersea cable goes down (network partition): **Block both cards** until the cable is fixed — you can't spend, but the balance is always correct (consistency over availability). **Let both cards work** — you can both spend, but you might overdraw because neither ATM knows about the other's transactions (availability over consistency). There's no option C where both cards work AND the balance is always correct during the outage. That's CAP. PACELC adds: even when the cable is fine, there's still a trade-off — do you wait for London to confirm every Delhi transaction (consistency, higher latency) or let Delhi proceed and sync later (lower latency, possible inconsistency)?

## The CAP Theorem: What It Actually Says

Formalized by Gilbert and Lynch (2002), building on Brewer's conjecture (2000):

**A distributed data store can provide at most two of these three guarantees simultaneously:**

- **C (Consistency)**: Every read returns the most recent write (linearizability — not ACID consistency).
- **A (Availability)**: Every request to a non-failing node receives a response (not an error).
- **P (Partition tolerance)**: The system continues operating despite network partitions (messages between nodes being lost or delayed).

**The critical insight**: In a distributed system, network partitions *will* happen. You can't choose to not have partitions — they're a fact of physics (cables break, switches fail, cloud availability zones lose connectivity). So **P is not optional**. The real choice is between **C** and **A** during a partition:

- **CP**: During a partition, reject requests that can't be guaranteed consistent. The system is correct but sometimes unavailable. Examples: ZooKeeper, etcd, HBase, Spanner (chooses to be unavailable in the partitioned minority).
- **AP**: During a partition, continue serving requests but allow potentially stale/inconsistent responses. The system is available but sometimes inconsistent. Examples: Cassandra, DynamoDB (default), CouchDB, DNS.

### How CAP Is Misused

**Misuse 1: "We chose AP because we need high availability."** CAP only applies during partitions. In the absence of a partition, you can have both C and A. Most of the time, there is no partition, and the system should provide strong consistency. Choosing AP doesn't mean you must be eventually consistent *all the time* — only during the (rare) partition events.

**Misuse 2: "CAP says you can only have two of three."** This framing suggests you pick two and completely abandon the third. Reality: CP systems are highly available (they only sacrifice availability during partitions, which are rare). AP systems provide reasonable consistency (they only diverge during partitions, and converge quickly after). The trade-off is at the margin, not absolute.

**Misuse 3: "MongoDB is CP" or "Cassandra is AP."** CAP is a property of the system's behavior during a specific partition, not a label for the database. The same database can behave differently depending on configuration: Cassandra with `QUORUM` reads/writes behaves more like CP for those operations. DynamoDB with `ConsistentRead=true` provides linearizable single-item reads (CP for that operation).

**Misuse 4: Treating CAP as a design tool.** CAP tells you about fundamental limits. It doesn't tell you what to build. Saying "we're AP" doesn't give you a concrete design — you still need to decide what kind of inconsistency is acceptable, how to detect and resolve conflicts, and how to communicate staleness to users.

### Kleppmann's Critique

Martin Kleppmann has argued (in talks and in DDIA) that CAP is too reductive to be useful for practical system design:

- CAP's "C" is specifically linearizability — but most systems don't need linearizability for most operations. There are many useful consistency models between linearizable and eventually consistent.
- CAP's "A" means every non-failing node responds — but in practice, we care about *latency* of responses, not just their existence. A system that responds in 30 seconds is technically "available" but practically useless.
- Network partitions are not binary (partition or no partition). In reality, you get partial failures: some messages are delayed, some nodes are slow, some links are congested. CAP doesn't model this nuance.

The conclusion: CAP is useful as a conversation starter ("you can't avoid this trade-off") but insufficient as a design tool. PACELC is more useful.

## PACELC: The More Useful Framework

Proposed by Daniel Abadi (2012). PACELC extends CAP by acknowledging that even when there's **no partition**, there's a trade-off between **latency** and **consistency**:

**If there is a Partition (P), choose between Availability (A) and Consistency (C). Else (E), choose between Latency (L) and Consistency (C).**

`P → A/C | E → L/C`

This captures what CAP misses: the everyday trade-off between consistency and performance. Even without partitions, enforcing linearizability requires cross-node coordination (synchronous replication, consensus), which adds latency. Relaxing consistency (async replication, local reads) reduces latency.

### Classifying Real Systems with PACELC

| System | During Partition (PA/PC) | Else (EL/EC) | Notes |
|--------|------------------------|-------------|-------|
| Spanner | PC | EC | Strong consistency always; pays latency for cross-region consensus |
| CockroachDB | PC | EC | Serializable; latency depends on data locality |
| Postgres (single-node) | N/A (not distributed) | EC | Strong consistency, no latency trade-off (single node) |
| Postgres (async replicas) | PA | EL | Available during partition (replicas serve stale reads); fast reads from local replica |
| Cassandra (QUORUM) | PC | EC | Quorum ensures consistency; cross-node latency |
| Cassandra (ONE) | PA | EL | Available during partition; fast local reads; stale data possible |
| DynamoDB (default) | PA | EL | Eventually consistent; low latency |
| DynamoDB (ConsistentRead) | PC | EC | Per-read choice |
| MongoDB (default) | PA | EL | Reads from secondaries may be stale |
| MongoDB (linearizable read) | PC | EC | Reads through primary with majority confirmation |

**The key insight from PACELC**: Most systems are configurable along both dimensions. DynamoDB lets you choose per-read (`ConsistentRead` flag). Cassandra lets you choose per-query (`ONE` vs `QUORUM` vs `ALL`). The choice isn't fixed at the system level — it's made at the operation level, based on what that specific operation needs.

## Practical Decision Framework

For each data access in your system, ask:

1. **What happens if this read returns stale data?** If the answer is "nothing serious" → EL (eventual consistency, fast reads). If the answer is "financial loss, security breach, or data corruption" → EC (strong consistency).

2. **What happens if this operation is unavailable during a network partition?** If the answer is "the user retries in 30 seconds and it's fine" → PC. If the answer is "the business loses revenue or users can't access critical functionality" → PA.

3. **How often do partitions actually occur?** In a single-region deployment with a single cloud provider, partitions are extremely rare (but not impossible). The EL/EC trade-off matters more day-to-day than the PA/PC trade-off.

Most applications end up with a **mixed strategy**: strong consistency for a small number of critical operations (payments, inventory decrements, user registration), eventual consistency for everything else (feeds, recommendations, analytics, caches).

## Trade-Off Analysis

| Strategy | Availability During Partition | Consistency Guarantee | Latency (Normal Operation) | Best For |
|----------|------------------------------|----------------------|---------------------------|----------|
| CP — refuse writes during partition (e.g., Spanner, Zookeeper) | Low — rejects requests without quorum | Strong — linearizable | Higher — quorum overhead | Financial transactions, coordination, leader election |
| AP — serve stale reads during partition (e.g., Cassandra, DynamoDB) | High — always responds | Eventual — may serve stale data | Lower — local reads | Shopping carts, social feeds, DNS |
| PC/EL — consistent + low latency (single-region strong) | Low | Strong | Low in-region, high cross-region | Single-region primary workloads (Aurora) |
| PA/EL — available + low latency (tunable) | High | Tunable per query | Low | Systems with mixed consistency needs |
| PA/EC — available + consistent normal ops | High | Strong when no partition | Moderate — pays consensus cost | Most business apps with rare partitions |

**The real lesson of CAP**: Network partitions are rare in a well-run data center, so the CP-vs-AP choice rarely triggers. What matters day-to-day is the PACELC extension: when there's no partition, do you optimize for latency or consistency? That's the trade-off you actually feel in production. Most systems benefit from strong consistency with local reads (PA/EC or PC/EL).

## Failure Modes

**Misapplying CAP to single-node systems**: A team uses CAP to justify eventual consistency for a single PostgreSQL instance. CAP only applies to distributed systems experiencing network partitions — a single node is always CA (consistent and available, no partition to worry about). Solution: understand that CAP is a statement about distributed systems, not a menu for single-database design choices.

**Treating availability as binary**: CAP's definition of "available" means every non-failing node returns a response. In practice, availability is a spectrum — 99.9% vs 99.99%. Teams choose AP systems thinking they get "100% availability" but still experience downtime from other causes (software bugs, overload, operator error). Solution: CAP is a theoretical framework, not an availability guarantee. Design for real-world failure modes, not just network partitions.

**Ignoring the ELC side of PACELC**: Teams focus on the "during partition" choice (CP vs AP) but ignore the more impactful "else" choice: latency vs consistency during normal operations. A CP system that also pays high latency for consistency during normal operations (PC/EC) is slower every day — not just during the rare partition. Solution: optimize for the common case (normal operations) first. Most traffic will never experience a partition.

**Network partition misdiagnosis**: A service appears to be experiencing a network partition (one replica is unreachable). The team triggers partition-mode behavior (degraded service, stale reads). In reality, the replica's disk is full or its process crashed — a non-partition failure that should trigger failover, not partition handling. Solution: implement proper failure detection that distinguishes network partitions from node failures.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Network Partition (The 'P')"
        Leader[Leader - Region A] --x|"✕ Partition"| Follower[Follower - Region B]
    end

    subgraph "CP Choice: Consistency"
        User1[User 1] -->|Write| Leader
        User2[User 2] -->|Read| Follower
        Follower -- "503 Unavailable\n(Blocks: avoids stale data)" --> User2
    end

    subgraph "AP Choice: Availability"
        User3[User 3] -->|Write| Leader
        User4[User 4] -->|Read| Follower
        Follower -- "200 OK\n(Stale Data: returns what it has)" --> User4
    end

    style Leader fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Follower fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Availability Target**: A system targeting "Five Nines" (99.999%) can only be down for **~5 minutes per year**. Achieving this typically requires an **AP (Available/Partition-Tolerant)** design or very fast automated failover.
- **Consistency Latency**: Enforcing strong consistency (EC in PACELC) usually adds **1 RTT** to every read/write. If nodes are in different regions, this adds **100ms - 200ms** to every operation.
- **Partition Frequency**: In a single cloud region, major network partitions are rare (estimated **< 1 major event per year**). The trade-off between **Latency and Consistency (EL/EC)** is 1000x more frequent than the trade-off between **Availability and Consistency (PA/PC)**.

## Real-World Case Studies

- **Amazon (Shopping Cart - AP)**: Amazon's original shopping cart was the classic use case for an **AP** system. They decided it was better to let a user add an item to their cart even if the network was partitioned (leading to potentially two versions of the cart that must be merged later) than to show an error message and lose a sale.
- **Google Spanner (Financial Records - CP)**: Google Spanner provides **External Consistency** (the strongest form of consistency). When there is a network partition that prevents a majority of replicas from communicating, Spanner chooses to become **Unavailable** for that portion of the data rather than risk a stale read or a double-spend, making it ideal for financial transactions.
- **LinkedIn (Feed vs. Profile - PACELC)**: LinkedIn uses different strategies for different data. For your **Social Feed**, they use **PA/EL** (Available and Low Latency), as a stale post is harmless. For your **User Profile/Settings**, they lean toward **PC/EC** (Consistent), ensuring that when you change your password or privacy settings, the change is reflected immediately and globally.

## Connections

- [[Consistency Spectrum]] — The detailed definitions of each consistency level that CAP and PACELC reference
- [[Session Guarantees]] — Practical guarantees that make eventual consistency usable for applications
- [[Database Replication]] — Synchronous vs asynchronous replication is the mechanism behind the EL/EC trade-off
- [[NewSQL and Globally Distributed Databases]] — Spanner and CockroachDB are PC/EC systems that accept latency for consistency
- [[Consensus and Raft]] — Consensus protocols are the mechanism that makes PC/EC possible

## Reflection Prompts

1. Your system uses DynamoDB with eventual consistency (PA/EL). A product manager reports that users occasionally see stale inventory counts and buy out-of-stock items. An engineer proposes switching all reads to `ConsistentRead=true` (PC/EC). What's the latency impact? What's a more targeted solution that provides strong consistency only where it matters?

2. A colleague says "we chose Cassandra because it's AP and we need high availability." Unpack this statement. What's correct? What's misleading? What questions should you ask about their actual consistency requirements?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 9: "Consistency and Consensus" includes the most lucid critique of CAP and explanation of its limitations
- Gilbert & Lynch, "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services" (2002) — the formal proof of CAP
- Abadi, "Consistency Tradeoffs in Modern Distributed Database System Design" (2012) — the PACELC paper
- Brewer, "CAP Twelve Years Later: How the 'Rules' Have Changed" (2012) — Brewer's own reflection on how CAP has been misunderstood
- Kleppmann, "Please Stop Calling Databases CP or AP" (blog post, 2015) — the argument for why CAP labels are misleading