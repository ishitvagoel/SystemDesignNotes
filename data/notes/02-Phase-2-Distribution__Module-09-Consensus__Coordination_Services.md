# Coordination Services

## Why This Exists

Distributed systems need shared state that's strongly consistent: "who is the current leader?", "what's the cluster configuration?", "which services are alive?", "has this lock been acquired?" Storing this in a regular database is possible but fragile — the database itself might be the thing you're trying to coordinate. Coordination services are purpose-built, strongly consistent key-value stores designed for exactly this: small amounts of critical metadata that every node must agree on.

They are not general-purpose databases. They store kilobytes to megabytes of configuration and coordination data, not gigabytes of application data. Their superpower is consensus-backed reads and writes with watch/notification semantics — every node can subscribe to changes and react immediately.


## Mental Model

A notary office for distributed systems. When multiple parties need to agree on something legally binding — who owns a property, who holds a lease — they go to the notary. The notary doesn't do the actual work, but they provide an authoritative, tamper-proof record that everyone trusts. ZooKeeper, etcd, and Consul are the notary offices of distributed systems. Services go to them for authoritative answers: who is the current leader? What's the current configuration? Is this distributed lock held? The notary itself must be highly reliable (replicated via Raft/ZAB), but most services don't interact with it on every request — just for the critical coordination moments.

## The Three Systems

### ZooKeeper

The elder statesman of coordination, originally developed at Yahoo (2007) for Hadoop. Uses the ZAB consensus protocol (Paxos-derived).

**Data model**: A hierarchical namespace (like a filesystem). Nodes are called **znodes**. Each znode stores data (up to 1MB) and can have child znodes. Path example: `/services/user-service/leader`.

**Key primitives**:
- **Ephemeral znodes**: Automatically deleted when the client session that created them disconnects. Used for leader election and service discovery — if a service crashes, its ephemeral znode disappears, signaling its departure.
- **Sequential znodes**: Automatically appended with a monotonically increasing counter. `create /locks/lock-` might create `/locks/lock-0000000007`. Used for distributed queue and lock implementations.
- **Watches**: A client can set a one-time watch on a znode. When the znode changes, the client is notified. Watches are one-shot — after firing, the client must re-register.

**Strengths**: Battle-tested (used by Kafka, Hadoop, HBase). Rich primitive set. Large community.

**Weaknesses**: Java-based (JVM overhead). One-shot watches (clients must re-register, creating a window for missed events). The hierarchical data model can be awkward for simple key-value use cases. Operational complexity (JVM tuning, GC pauses affecting latency).



**2025 Update — KRaft and ZooKeeper's End**: Apache Kafka 4.0 (March 2025) completely removed ZooKeeper, making KRaft the sole metadata management system. Kafka 3.9 was the final version to support ZooKeeper. This is the most significant architectural change in Kafka's history — it eliminates the need for ZooKeeper entirely for Kafka deployments, which was historically ZooKeeper's largest use case. For new Kafka deployments, ZooKeeper is no longer relevant. For existing ZooKeeper-based Kafka clusters, migration to KRaft via Kafka 3.9 (the bridge release) is required before upgrading to Kafka 4.x.

### etcd

Created by CoreOS (2013) as the coordination backbone for Kubernetes. Uses Raft for consensus.

**Data model**: Flat key-value store with lexicographic ordering. Keys are byte strings; values are byte strings. No hierarchy — paths like `/services/user-service/leader` are just strings with `/` characters.

**Key primitives**:
- **Leases**: A time-limited grant attached to keys. If the lease expires (client doesn't renew), all keys attached to the lease are deleted. Equivalent to ZooKeeper's ephemeral znodes but more flexible (one lease can cover multiple keys).
- **Watches**: Continuous streams (not one-shot like ZooKeeper). A client watches a key or prefix and receives a stream of change events. No re-registration needed — much simpler than ZooKeeper's watch model.
- **Transactions**: Atomic compare-and-swap (CAS) operations. `if key X has value V, then set key Y to W, else fail`. Enables lock acquisition and leader election without race conditions.
- **MVCC**: etcd keeps a revision history. You can read the value of a key at any past revision, enabling consistent point-in-time snapshots.

**Strengths**: Simpler than ZooKeeper. Raft-based (well-understood). gRPC API (efficient, typed). Watch streams (no re-registration). Kubernetes's default — massive adoption and testing. Go-based (simpler operations than JVM).

**Weaknesses**: Designed for small clusters (3–7 nodes). Not suitable for large-scale service discovery (thousands of services — use Consul or a service mesh instead). Performance degrades with large data sizes (etcd is tuned for <1GB of data).

### Consul

Created by HashiCorp (2014). Uses Raft for consensus but adds a gossip protocol (Serf) for membership and failure detection across a potentially large cluster.

**Data model**: Key-value store plus first-class service discovery and health checking.

**Key differentiator — service discovery**: Consul natively supports service registration, health checks (HTTP, TCP, script-based), and DNS-based service discovery. Services register with Consul, Consul monitors their health, and clients query Consul to find healthy instances. This is built-in, not bolted on like it is with ZooKeeper or etcd.

**Multi-datacenter**: Consul supports multi-datacenter federation natively. Each datacenter has its own Raft cluster, and datacenters communicate via WAN gossip. Cross-datacenter queries are routed automatically.

**Strengths**: Best-in-class service discovery. Multi-DC out of the box. Connect (service mesh with mTLS). Rich health checking.

**Weaknesses**: More opinionated (service discovery is central, not optional). More operational surface area (Raft + gossip + health checks). Less commonly used for pure coordination tasks compared to etcd or ZooKeeper.

### Comparison

| Dimension | ZooKeeper | etcd | Consul |
|-----------|-----------|------|--------|
| Consensus | ZAB (Paxos variant) | Raft | Raft |
| Data model | Hierarchical (znodes) | Flat key-value | Key-value + service catalog |
| Watch mechanism | One-shot | Continuous stream | Blocking queries |
| Service discovery | Manual (via ephemeral znodes) | Manual (via leases) | Native (first-class) |
| Multi-datacenter | No (external tooling) | No (single cluster) | Yes (native federation) |
| Language | Java | Go | Go |
| Primary use case | Kafka, Hadoop coordination | Kubernetes, general coordination | Service discovery, service mesh |

## What to Use When

**etcd**: Default choice for coordination in Kubernetes-based infrastructure. Leader election, configuration, distributed locks for a modest number of services.

**ZooKeeper**: Legacy systems (Kafka prior to KRaft mode, Hadoop, HBase). If you're already running it, keep using it. For new systems, etcd is usually simpler.

**Consul**: When you need service discovery + health checking + coordination in one tool, especially across multiple data centers. Also if you want HashiCorp's service mesh (Consul Connect).

**None of the above**: For very simple needs (one leader election, one config value), you might use a database lock or Redis. For massive-scale service discovery (10,000+ services), a service mesh (Istio, Linkerd) with its own control plane may be more appropriate.

## Trade-Off Analysis

| Service | Consistency | Read Performance | Write Performance | Operational Complexity | Best For |
|---------|------------|-----------------|-------------------|----------------------|----------|
| ZooKeeper | Linearizable writes, sequential reads | High — followers serve reads | Moderate — leader only | High — JVM tuning, separate ensemble | Kafka (pre-KRaft), HBase, legacy Hadoop ecosystem |
| etcd | Linearizable reads and writes | Moderate — all reads through leader (or leases) | Moderate — Raft-based | Medium — single binary, simpler ops | Kubernetes, small-to-medium coordination |
| Consul | Linearizable writes, tunable reads | High — stale reads option | Moderate — Raft-based | Low-Medium — built-in service mesh, DNS | Service discovery, health checking, multi-DC |
| Chubby (Google internal) | Linearizable | High with caching | Moderate | N/A — Google-only | Google's distributed lock service |

**Do you even need a coordination service?** Many teams reach for ZooKeeper or etcd when they could use simpler patterns. Database-backed leader election (advisory locks in PostgreSQL), Redis-based locks (with Redlock caveats), or even DNS-based service discovery often suffice. Coordination services are warranted when you need strong consistency across multiple systems — leader election for a distributed database, configuration that must be globally consistent, or distributed locks with fencing.

## Failure Modes

**ZooKeeper session timeout thrashing**: A client's garbage collection pause exceeds the ZooKeeper session timeout. ZK declares the session dead, deletes ephemeral nodes (releasing locks, deregistering services), then the client resumes and re-creates everything. Under GC pressure, this cycle repeats, causing oscillating leader elections and service registration churn. Solution: increase session timeouts above worst-case GC pause, tune JVM GC settings, or use G1/ZGC for low-pause collection.

**etcd storage quota exhaustion**: etcd has a default 2GB storage quota. A high-churn workload (frequent key updates, no compaction) fills the quota. etcd enters alarm mode, rejecting all writes. The entire Kubernetes cluster becomes unmanageable. Solution: enable automatic compaction (`--auto-compaction-retention`), defragment regularly, monitor `db_size` metric, and increase quota if workload justifies it.

**Coordination service as a hot path**: Developers use ZooKeeper or etcd for configuration that changes rarely (feature flags, database connection strings) but then start using it for high-frequency reads (per-request ACL checks, rate limit counters). The ensemble becomes a bottleneck. Solution: use watches or local caching with invalidation for configuration, and use purpose-built stores (Redis, local memory) for high-frequency reads.

**Ensemble split-brain during network partition**: A 3-node ZooKeeper ensemble splits into a group of 2 and a group of 1. The group of 2 continues operating (has quorum). But if both groups think they're the quorum (misconfigured quorum size, or observers counted as participants), two leaders emerge. Solution: always use an odd number of nodes, never override quorum calculation, and test network partition scenarios.

**Watch notification storm**: Thousands of clients watch the same key (a configuration value). When it changes, ZooKeeper or etcd sends a notification to every watcher simultaneously. The burst of reconnections and re-reads overwhelms the ensemble. Solution: stagger watch registrations with jitter, use a fanout layer between the coordination service and clients, or push configuration via a different mechanism (config server with polling).

## Architecture Diagram

```mermaid
graph TD
    subgraph "Coordination Ensemble (Quorum)"
        L[(Leader)]
        F1[(Follower A)]
        F2[(Follower B)]
        L --- F1
        L --- F2
    end

    subgraph "Clients"
        S1[App Service 1]
        S2[App Service 2]
        K8s[K8s API Server]
    end

    S1 -- "1. Create Ephemeral Key /lock" --> L
    S2 -- "2. Watch Key /lock" --> L
    K8s -- "3. Store Cluster State" --> L
    
    L -.->|4. Notify Change| S2
    
    style L fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style F1 fill:var(--surface),stroke:var(--border),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **Cluster Size**: Stick to **3, 5, or 7 nodes**. 5 is the "Sweet Spot" (tolerates 2 failures with moderate consensus overhead).
- **Data Limit**: Individual keys should be **< 1MB**. The entire dataset should typically be **< 1GB** (etcd) to **< 10GB** (ZooKeeper).
- **Watch Latency**: Notifications are typically delivered in **< 10ms** after a write is committed.
- **Session Timeout**: Set to **2x - 3x your max expected GC pause** (e.g., if GC is 500ms, set timeout to 1.5s) to avoid "flapping" leader elections.

## Real-World Case Studies

- **Kubernetes (etcd)**: Kubernetes uses **etcd** as its single source of truth. Every Pod, Service, and ConfigMap is stored in etcd. If etcd is slow or unavailable, the entire Kubernetes control plane grinds to a halt. This is why etcd performance (especially disk IOPS) is the most critical metric for Kubernetes stability.
- **Yahoo! (ZooKeeper Origins)**: Yahoo! originally built ZooKeeper to solve the "configuration nightmare" of its massive Hadoop and HBase clusters. Before ZooKeeper, every team was building their own fragile coordination logic. ZooKeeper provided a standardized, Paxos-backed API that allowed them to manage thousands of nodes with a simple hierarchical data model.
- **HashiCorp (Consul at Robinhood)**: Robinhood uses **Consul** for service discovery across their massive microservices fleet. Because Consul provides a DNS interface, their services can find each other using standard lookups (e.g., `orders.service.consul`) without needing specialized client libraries, simplifying their polyglot environment (Python, Go, etc.).

## Connections

- [[Consensus and Raft]] — etcd and Consul use Raft; ZooKeeper uses ZAB
- [[Distributed Locks and Fencing]] — All three provide primitives for distributed locking
- [[Load Balancing Fundamentals]] — Service discovery feeds into load balancer backend lists
- [[API Gateway Patterns]] — Gateways can use coordination services for dynamic routing configuration
- [[Kubernetes and Platform Engineering]] — etcd is Kubernetes's sole data store

## Reflection Prompts

1. Your team runs Kafka with ZooKeeper for broker coordination. Kafka has released KRaft mode (replacing ZooKeeper with an internal Raft implementation). What are the trade-offs of migrating? What does ZooKeeper do for Kafka that KRaft replaces?

2. You need to implement leader election for a service with 3 instances. You're considering: (a) etcd lease-based election, (b) Postgres advisory locks, (c) Redis `SET NX` with TTL. Compare the consistency guarantees, failure modes, and operational complexity of each approach.

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 9 discusses ZooKeeper's role in consensus and coordination
- etcd documentation (etcd.io) — comprehensive reference for the API, watch mechanism, and clustering
- Hunt et al., "ZooKeeper: Wait-free Coordination for Internet-scale Systems" (USENIX ATC 2010) — the ZooKeeper paper
- Consul documentation (consul.io) — service discovery, health checking, and multi-DC federation