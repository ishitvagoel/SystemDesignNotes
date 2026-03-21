# Leaderless Replication

## Why This Exists

Single-leader replication has a SPOF (the leader). Multi-leader has write conflicts. Leaderless replication eliminates the leader entirely: any node can accept reads and writes. The client sends operations to multiple nodes and uses quorum logic to determine correctness.

This approach, pioneered by Amazon's Dynamo (2007), trades simplicity for availability. There's no failover (no leader to fail), no replication lag in the traditional sense (writes go directly to multiple nodes), and no single bottleneck. The cost: weaker consistency guarantees, more complex read paths, and the need for background repair processes to keep replicas converged.


## Mental Model

A group chat where everyone can speak at once. In leader-based replication, there's a moderator (leader) who decides the order of messages — orderly but slow, and if the moderator leaves, the chat pauses. In leaderless replication, there's no moderator. Anyone can post anytime (write to any replica). When you want to read, you ask multiple people "what's the latest?" and take the most up-to-date answer (read quorum). If someone missed a message while they were offline, they catch up by comparing notes with others (read repair, anti-entropy). It's noisier and requires more work to stay consistent, but it never pauses because one person left the room.

## How It Works

### Quorum Reads and Writes

With N replicas, the client writes to W nodes and reads from R nodes.

**The quorum condition**: If `W + R > N`, at least one node in the read set has the latest write. This guarantees the reader sees the most recent value (assuming no concurrent writes).

**Common configurations**:
- `N=3, W=2, R=2`: Standard. Tolerates 1 node failure for both reads and writes. The overlap is 1 node.
- `N=3, W=3, R=1`: Write-heavy optimization. Writes are slower (wait for all 3), reads are fast (1 node suffices). No write tolerance for node failure.
- `N=3, W=1, R=3`: Read-heavy optimization. Writes are fast (1 node), reads check all 3. No read tolerance for node failure.
- `N=5, W=3, R=3`: Higher availability. Tolerates 2 node failures.

**Why `W + R > N` works**: Write touches W nodes. Read touches R nodes. If W + R > N, the write set and read set must overlap by at least one node. That node has the latest write, so the reader can identify and return the newest version.

**When `W + R ≤ N`**: Read and write sets may not overlap. The reader might miss the latest write — eventual consistency with no freshness guarantee.

### Version Resolution on Read

When reading from R nodes, the client may receive different values (some nodes have the latest version, others are stale). The client resolves by:

1. Comparing version numbers (or vector clocks) across responses.
2. Selecting the value with the highest version.
3. Optionally performing **read repair**: writing the latest value back to any stale nodes that returned an older version. This is an opportunistic convergence mechanism.

### Sloppy Quorums and Hinted Handoff

**Strict quorum**: Writes must go to W of the N designated replicas for a key. If fewer than W designated replicas are available, the write fails.

**Sloppy quorum**: If a designated replica is unavailable, the write goes to a non-designated node (any available node) instead. The quorum requirement is still met (W nodes acknowledged), but some of those nodes are "wrong" (they don't normally hold this key's data).

**Hinted handoff**: The non-designated node stores the write with a "hint" — metadata indicating which designated replica should eventually receive it. When the designated replica comes back online, the hinted writes are forwarded to it.

**The trade-off**: Sloppy quorums improve write availability (writes succeed even when designated replicas are down). But they weaken consistency — a read from the designated replicas might not find the write (it's on a non-designated node). The quorum condition `W + R > N` no longer guarantees freshness when sloppy quorums are in effect.

**Cassandra's approach**: Sloppy quorums are configurable. `ConsistencyLevel.QUORUM` uses strict quorums. `ConsistencyLevel.ONE` or `ConsistencyLevel.ANY` allow sloppy quorums for maximum availability.

### Anti-Entropy

Read repair is opportunistic — it only fixes stale replicas that happen to be read. For data that's rarely read, stale replicas might never be repaired. **Anti-entropy** is a background process that proactively compares replicas and synchronizes differences.

**Merkle trees**: Each replica builds a hash tree (Merkle tree) over its data. The tree is structured so that comparing root hashes quickly reveals whether two replicas agree. If they disagree, the tree is traversed to identify the specific keys that differ — only those keys are synchronized. This makes anti-entropy efficient even for large datasets.

**Frequency trade-off**: Running anti-entropy continuously consumes I/O and network bandwidth. Running it rarely allows replicas to drift. Most systems run it periodically (hourly or daily) and rely on read repair for real-time convergence.

## Trade-Off Analysis

| Replication Model | Write Latency | Read Consistency | Failure Tolerance | Coordination | Best For |
|------------------|--------------|------------------|-------------------|--------------|----------|
| Single-leader | Low (local write) | Strong from leader | Leader failure = brief unavailability | Leader election | OLTP, sequential consistency needs |
| Multi-leader | Low (local write per region) | Conflict resolution needed | Tolerates region failure | Conflict resolution protocol | Multi-region writes, collaborative apps |
| Leaderless (quorum) | Moderate — must contact W nodes | Tunable (R+W>N for strong) | Tolerates N-W node failures on write | Anti-entropy, read repair | Write availability, no single point of failure |
| Leaderless (sloppy quorum + hinted handoff) | Low — any node accepts write | Weak — hinted handoff is best-effort | Very high — always writable | Background reconciliation | Maximum write availability (Dynamo, shopping cart) |

**R + W > N doesn't guarantee linearizability**: Even with quorum reads and writes, you can get stale data during concurrent writes (last-writer-wins), or during network partitions where the quorum shifts. True linearizability requires either a single leader or a protocol like ABD that adds an extra round-trip. Quorum systems give you "strong enough" consistency for most use cases, but not the strongest.

## Failure Modes

- **Stale reads despite quorum**: With sloppy quorums, a write goes to 2 designated + 1 non-designated node (W=3). A read queries 3 designated nodes (R=3). Only 2 of the 3 designated nodes have the write — the third is stale. The quorum condition `W + R > N` is satisfied numerically but not in practice because the sets don't overlap as expected. This is the fundamental weakness of sloppy quorums.

- **Write conflicts**: Two clients write different values to the same key concurrently. Both writes reach W nodes. The replicas now hold conflicting versions. Resolution requires version vectors and a conflict resolution strategy ([[Multi-Leader and Conflict Resolution]]).

- **Anti-entropy lag**: A replica was down for a week. When it comes back, the anti-entropy process must synchronize a week's worth of changes. If the dataset is large, this can take hours and consume significant I/O. During this window, reads that hit the stale replica return old data.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Quorum Write (W=2, N=3)"
        ClientW[Client] -->|Write| Node1[(Node 1: OK)]
        ClientW -->|Write| Node2[(Node 2: OK)]
        ClientW -.->|Write| Node3[(Node 3: Offline)]
    end

    subgraph "Quorum Read (R=2, N=3)"
        ClientR[Client] -->|Read v2| Node1
        ClientR -->|Read v1| Node2
        ClientR -->|Read Repair: Write v2| Node2
    end

    style Node1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Node2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Quorum Math**: To guarantee seeing the latest write, ensure **R + W > N**. Standard config: `N=3, W=2, R=2`.
- **Write Availability**: A system with `N=3, W=2` can tolerate **1 node failure** for writes. `W=1` provides higher availability but risks data loss.
- **Read Repair Overhead**: If your nodes drift frequently, read repair can add **~10-20% latency** to read operations as the client performs background writes to stale nodes.
- **Anti-Entropy Bandwidth**: Merkle tree comparisons for background repair typically consume **< 1% of total network bandwidth** but can spike during full cluster rebalances.

## Real-World Case Studies

- **Amazon (The Dynamo Paper)**: Amazon's **Dynamo** was the pioneer of leaderless replication. They needed a system that was "always writable" for their shopping cart. They used **Sloppy Quorums** and **Hinted Handoff** to ensure that even if the primary storage nodes for a user were down, some other node would accept the "Add to Cart" request, ensuring no lost sales.
- **Apache Cassandra**: Cassandra is the most popular open-source implementation of leaderless replication. It allows developers to tune consistency per-query (e.g., `SELECT ... USING CONSISTENCY QUORUM`). Uber uses Cassandra to store trip data, relying on its leaderless nature to handle the high-throughput write volume of millions of concurrent GPS updates.
- **Riak (Distributed Key-Value)**: Riak was an early leaderless database that used **Merkle Trees** for extremely efficient anti-entropy. It was used by companies like Betfair to handle massive betting volumes during sporting events, where the ability to scale horizontally by just adding "dumb" nodes (no leader election required) was a major operational advantage.

## Connections

- [[Database Replication]] — Leaderless is one of the three replication topologies introduced in Module 4
- [[Multi-Leader and Conflict Resolution]] — Leaderless faces the same concurrent write conflicts as multi-leader
- [[CRDTs]] — CRDTs can replace version vectors for conflict-free merging in leaderless systems
- [[Consistency Spectrum]] — Leaderless with strict quorums approximates linearizability for non-concurrent operations; sloppy quorums provide eventual consistency

## Reflection Prompts

1. You're running a 5-node leaderless cluster with quorum settings W=3, R=3. A network partition isolates 2 nodes from the other 3. The group of 3 can still accept writes (W=3 met). The group of 2 cannot (W=3 not met). But a client connected to the group of 2 tries to read with R=3 — it can only reach 2 nodes. How does this affect the system's availability claim, and what would setting R=2 change?

2. Two clients simultaneously write different values to the same key. Client A writes to nodes {1,2,3}, client B writes to nodes {3,4,5}. Node 3 receives both writes. With last-writer-wins, one write is silently lost. Describe a scenario where this data loss causes a real business problem, and propose a conflict resolution strategy that would prevent it.

3. Your leaderless cluster uses sloppy quorum with hinted handoff. During a partition, writes are accepted by non-home nodes. After the partition heals, hinted handoff replays those writes to the correct nodes. But some hints are lost because the temporary node crashed before handoff completed. How would you detect this data inconsistency, and what role does anti-entropy (Merkle trees) play?

## Canonical Sources

- DeCandia et al., "Dynamo: Amazon's Highly Available Key-Value Store" (2007) — the foundational paper defining leaderless replication with quorums, sloppy quorums, hinted handoff, and anti-entropy
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5 covers leaderless replication in detail