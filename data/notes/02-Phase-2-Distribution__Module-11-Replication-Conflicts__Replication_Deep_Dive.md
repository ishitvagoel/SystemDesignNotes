# Replication Deep Dive

## Why This Exists

[[Database Replication]] in Module 4 introduced the three replication topologies. This note goes deep on single-leader replication — the most common topology — focusing on the operational challenges that determine whether replication actually works in production: failover mechanics, split-brain prevention, and the practical patterns for handling replication lag.


## Mental Model

Replication is photocopying a document and distributing copies to multiple offices. If only the headquarters (leader) can edit the original, the copies stay in sync easily — but if HQ is unreachable, nobody can make edits. The deeper you go, the harder the questions get: What happens if HQ goes down — who becomes the new HQ (failover)? What if two offices both think they're HQ (split-brain)? What if an office has a slightly outdated copy and a client reads from it (replication lag)? Replication isn't the hard part — handling everything that goes wrong with replication is.

## Failover: The Critical Operation

When the leader fails, a follower must be promoted. Automated failover involves three steps, each with its own failure modes:

### 1. Detecting the Failure

**Heartbeat-based**: The leader sends periodic heartbeats to followers (or to a monitoring service). If heartbeats stop for a configurable timeout (typically 10–30 seconds), the leader is declared dead.

**The false positive problem**: A leader experiencing a GC pause, high CPU load, or a transient network issue might miss heartbeats. If declared dead prematurely, a failover is triggered unnecessarily — the "old" leader comes back and finds it's been replaced. Now you have two leaders (split-brain).

**The false negative problem**: If the timeout is too long, a genuinely dead leader isn't detected for 30+ seconds. All writes are blocked during this window.

**Tuning guidance**: Set the timeout based on your tolerance for downtime vs false failovers. 10 seconds is aggressive (fast detection, more false positives). 30 seconds is conservative (fewer false positives, longer downtime on real failure). Patroni (Postgres) defaults to 30 seconds.

### 2. Choosing the New Leader

The follower with the most up-to-date replication position (closest to the old leader's last WAL position) is the best candidate. If using Raft-based replication (CockroachDB, TiKV), the Raft election restriction guarantees the most up-to-date follower wins.

**The data loss risk**: With asynchronous replication, the most up-to-date follower may still be behind the failed leader. Writes accepted by the old leader but not yet replicated are lost. The amount of data loss is bounded by the replication lag at the moment of failure.

For zero data loss, use synchronous replication to at least one follower — but this means every write waits for the follower's ACK, increasing latency. Semi-synchronous (Postgres `synchronous_standby_names` with one sync replica) is the practical compromise.

### 3. Reconfiguring Clients

Clients must discover the new leader. Approaches:

- **DNS failover**: Update DNS to point to the new leader. Slow (DNS TTL caching) but simple.
- **Virtual IP (VIP)**: A floating IP that moves to the new leader. Fast (ARP update) but limited to a single network segment.
- **Proxy-based**: A proxy (HAProxy, PgBouncer, ProxySQL) routes to the current leader. The proxy updates its target on failover. Clients are unaware of the change.
- **Service discovery**: Consul, etcd, or ZooKeeper holds the current leader address. Clients query the discovery service. Fast, resilient, but adds a dependency on the discovery service.

## Split-Brain

The most dangerous replication failure: two nodes both believe they're the leader and both accept writes. Data diverges irrecoverably.

**How it happens**: Network partition separates the leader from the monitoring system. The monitoring system declares the leader dead and promotes a follower. The original leader is alive, accepting writes from clients on its side of the partition. Two leaders.

**Prevention — STONITH (Shoot The Other Node In The Head)**: Before promoting a new leader, forcibly shut down (or fence) the old leader. This is done via hardware-level mechanisms: IPMI power-off, cloud API instance termination, or storage fencing (revoke the old leader's access to shared storage). If you can't guarantee the old leader is dead, don't promote a new one.

**Prevention — consensus-based election**: Use Raft or a coordination service (etcd, ZooKeeper) to elect the leader. The consensus protocol guarantees at most one leader per term. Patroni (for Postgres) uses etcd/ZooKeeper/Consul for leader election, providing split-brain prevention.

**Detection and resolution**: If split-brain does occur, you must choose which leader's writes to keep and discard the other's. This is operationally painful and may require manual data reconciliation. Prevention is vastly preferable to resolution.

## Handling Replication Lag

Replication lag is inevitable with asynchronous replication. The patterns from [[Session Guarantees]] address this, but here are the concrete implementation strategies:

### Read-After-Write via Leader Routing

After a write, route the user's subsequent reads to the leader (not a replica) for a brief window:

```
on_write(user_id):
    set_cache(f"recent_write:{user_id}", timestamp=now(), ttl=5s)

on_read(user_id):
    if get_cache(f"recent_write:{user_id}"):
        route_to_leader()
    else:
        route_to_replica()
```

**Trade-off**: Increases leader read load during the routing window. If many users write frequently, most reads go to the leader — defeating the purpose of read replicas.

### Replica Lag Monitoring

Track each replica's lag. Route reads only to replicas within an acceptable lag threshold:

```
on_read():
    replicas = get_healthy_replicas(max_lag=1s)
    if replicas:
        route_to(random_choice(replicas))
    else:
        route_to_leader()  # All replicas too stale
```

Postgres exposes `pg_last_wal_replay_lsn()` and `pg_last_xact_replay_timestamp()` for tracking replica currency. MySQL has `Seconds_Behind_Master`.

## Trade-Off Analysis

| Replication Method | Lag | Data Loss on Failure | Throughput Impact | Best For |
|-------------------|-----|---------------------|--------------------|----------|
| Synchronous replication | Zero | Zero — committed means replicated | High — every write waits for replica | Financial data, systems of record |
| Semi-synchronous (1 sync + N async) | Zero for 1 replica, lag for rest | Zero for 1 replica | Moderate | MySQL with semi-sync, production databases |
| Asynchronous replication | Seconds to minutes | Possible — uncommitted writes lost on failover | Minimal — fire and forget | Read replicas, analytics, cross-region secondaries |
| Logical replication (row-level) | Seconds | Possible | Low — only changed rows | Cross-version upgrades, selective table replication |
| Physical replication (WAL shipping) | Seconds | Possible | Minimal — streaming WAL bytes | Standby replicas, point-in-time recovery |
| Change Data Capture (CDC) | Near real-time | Possible | Minimal — reads WAL | Event publishing, search index sync, data pipelines |

**The replication lag guarantee you actually need**: Most teams configure async replication and accept seconds of lag for read replicas. The critical question is: what happens during failover? If the primary fails with unreplicated writes, those writes are lost. Semi-synchronous replication (wait for at least one replica before acknowledging) is the best compromise — zero data loss with moderate performance impact.

## Failure Modes

**WAL shipping disk space exhaustion**: The primary retains WAL segments for replicas that are lagging. If a replica falls far behind (hours of lag), the primary's WAL directory grows until it fills the disk. The primary crashes, taking down the entire system — not just the laggy replica. Solution: set `wal_keep_size` (PostgreSQL) or `max_slot_wal_keep_size` to cap retention, monitor WAL disk usage, and allow the laggy replica to re-bootstrap from a base backup instead.

**Logical replication divergence**: Logical replication applies SQL-level changes (INSERT, UPDATE, DELETE). If the subscriber has triggers, constraints, or default values that differ from the publisher, the replicated data may diverge silently. Solution: ensure publisher and subscriber schemas are compatible, disable conflicting triggers on the subscriber, and periodically validate data consistency with checksums.

**Replication lag hiding behind averages**: Average replication lag is 200ms, but p99 is 30 seconds. An SLO based on average lag shows "healthy" while 1% of reads serve data 30 seconds stale. Solution: monitor and alert on percentile lag (p99, p999), not averages. Set SLOs on tail lag: "p99 replication lag < 2 seconds."

**Cascading replica failure**: Primary replicates to replica A, which replicates to replica B (cascading). If replica A fails, replica B loses its source and falls behind. Reconfiguring B to replicate directly from the primary adds load to the primary. Solution: automate replica topology reconfiguration (orchestrators like Orchestrator for MySQL, Patroni for PostgreSQL), and ensure the primary can handle the additional replication connections.

**Binary replication version incompatibility**: Physical replication (WAL shipping) requires identical major versions between primary and replica. A major version upgrade requires taking replicas offline, upgrading them, and rebuilding. During this window, you have no standby for failover. Solution: use logical replication for cross-version replication during upgrade windows, or use a blue-green upgrade approach with a new replica set.

## Connections

- [[Database Replication]] — Module 4's introduction to replication topologies
- [[Multi-Leader and Conflict Resolution]] — When single-leader's constraints (single write endpoint) are too restrictive
- [[Session Guarantees]] — The client-facing guarantees that make replication lag manageable
- [[Write-Ahead Log]] — WAL shipping is the mechanism beneath physical replication
- [[Coordination Services]] — Consensus-based leader election prevents split-brain

## Reflection Prompts

1. Your Postgres failover is automated via Patroni + etcd. The primary goes down, and Patroni promotes a replica within 15 seconds. During those 15 seconds, your application receives 5xx errors on all writes. How do you minimize this disruption? Consider: connection pooling behavior, retry logic, and read-only mode.

2. After a failover, you discover that the promoted replica was 3 seconds behind the old primary. Those 3 seconds of writes are permanently lost. For which kinds of data is this acceptable, and for which is it not? How would you architect the system differently for data that cannot tolerate any loss?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5: "Replication" covers failover, split-brain, and replication lag in depth
- Patroni documentation (github.com/zalando/patroni) — the standard tool for Postgres HA with consensus-based leader election
- Percona Blog, "MySQL Replication Best Practices" — operational guidance for MySQL replication