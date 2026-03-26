# First Principles Thinking

## Why This Exists

Most system design advice is handed down as received wisdom: "Use Kafka for high-throughput messaging," "Postgres for relational data," "microservices for scale." This advice is not wrong — but it is incomplete. It tells you what other people decided without telling you *why*, which means you cannot evaluate whether those same conditions apply to your situation.

First principles thinking is the discipline of decomposing a problem to its fundamental, irreducible truths and reasoning upward from there. It is how physicists derive equations rather than memorising them. Applied to system design, it means you derive the right architecture from your constraints instead of copying from a pattern catalogue.

## Mental Model

> **System design is applied physics — you are managing forces, not picking tools.**

Every design decision is a choice of where to stand along one or more tension axes. The forces are always present. Ignoring them does not make them go away; it just means you discover them in production instead of at the whiteboard.

## The 5 Fundamental Tensions

These are the "conservation laws" of system design. You cannot eliminate them — you can only decide where to take the cost.

### 1. Consistency vs Availability

**The force**: In a distributed system, if a network partition occurs, you must choose whether to serve possibly stale data (availability) or refuse to serve until consistency is restored (consistency). You cannot manufacture both from nothing.

**Physics isomorphism**: Conservation of energy. You cannot create free energy; you can only convert it. Similarly, you cannot create both strong consistency and high availability simultaneously across a partition — you can only trade one for the other.

**Design implication**: DNS and CDN caches choose availability (stale reads are acceptable). Bank account balances choose consistency (stale reads are unacceptable). Most systems should be honest about which camp they are in, rather than pretending the choice doesn't exist.

### 2. Latency vs Throughput

**The force**: You can optimise for how fast a single request completes (latency) or how many requests you serve per second (throughput), but optimising one often trades against the other.

**Physics isomorphism**: Velocity vs volume in fluid dynamics. You can have a narrow, fast stream or a wide, slow river. The cross-sectional area times velocity equals flow rate — widening the pipe (batching, parallelism) increases throughput but increases latency for individual items.

**Design implication**: Batch processing pipelines optimise for throughput. Interactive APIs optimise for latency. When you add a queue between a producer and consumer, you are explicitly trading latency for throughput stability.

### 3. Simplicity vs Flexibility

**The force**: A simple system is easy to understand, operate, and debug. A flexible system can handle more scenarios. Adding flexibility always adds complexity; complexity cannot be wished away.

**Physics isomorphism**: Entropy. The second law of thermodynamics says closed systems naturally trend toward disorder. Software is the same: without active effort, systems accumulate complexity (configuration options, edge-case handlers, abstraction layers). Simplicity requires deliberate, ongoing force applied against entropy.

**Design implication**: Every abstraction layer, plugin system, or configuration option is a complexity tax. Take it only when the flexibility it buys is worth the maintenance burden. The right question is not "could this feature ever be useful?" but "does the value justify the complexity now?"

### 4. Cost vs Performance

**The force**: Performance improvements have diminishing returns. The last 10% of performance improvement often costs as much as the first 90%.

**Physics isomorphism**: The efficient frontier in thermodynamics and economics. There is a boundary beyond which you cannot improve output without increasing input. Systems operating at the frontier cannot get better in one dimension without getting worse in another.

**Design implication**: Identify where you are on the cost-performance curve before investing in optimisation. If you are far from the frontier (your system is inefficient), small changes yield large gains. If you are near the frontier, you are in diminishing returns territory — the ROI of further optimisation drops sharply.

### 5. Durability vs Speed

**The force**: Writing to persistent storage is slower than writing to memory. The more durable you make a write (WAL, fsync, replication acknowledgement), the slower it is.

**Physics isomorphism**: Friction. Disk I/O is the friction that makes writes survive power loss. You cannot eliminate friction without losing the benefits it provides — just as you cannot have a car that both brakes instantly and accelerates instantly from rest.

**Design implication**: Systems that need high write throughput buffer writes in memory and flush to disk asynchronously (trading some durability for speed). Systems where every write must survive a crash use synchronous fsync (trading speed for durability). Knowing which you need before choosing a storage engine is non-negotiable.

---

## Worked Example: Same Requirements, Different Dominant Tension

**Requirements**: Build a system that records user activity events (clicks, page views) and allows analysts to query them.

Two teams interpret the requirements differently:

| Team | Dominant tension they focus on | Architecture they choose |
|------|-------------------------------|--------------------------|
| A | Durability vs Speed — "we must never lose an event" | Synchronous writes to Postgres with WAL, low-throughput ingestion |
| B | Latency vs Throughput — "we ingest 500K events/sec" | Kafka → object storage (S3), async flush, eventual query freshness |
| C | Cost vs Performance — "analysts run ad-hoc queries, budget is $500/month" | Batch CSV uploads to SQLite + DuckDB, query latency in seconds is fine |

All three are correct for different constraints. The same four words — "record user activity" — yield three completely different architectures depending on which tension dominates. This is why extracting constraints (see [[00-Phase-0__Requirements_to_Constraints]]) before choosing an architecture is non-negotiable.

---

## Connections

- [[00-Phase-0__The_Physics_of_Distributed_Systems]] — deepens the physics analogies introduced here
- [[00-Phase-0__Requirements_to_Constraints]] — how to identify which tension dominates for your system
- [[00-Phase-0__Reasoning_Through_Trade-Offs]] — how to make decisions once you know the dominant tension
- [[Phase_0_MOC]] — phase overview

## Reflection Prompts

- For the last system you designed or reviewed: which of the 5 tensions was the dominant force? Was it treated as such in the design?
- Have you ever seen a team try to optimise for both ends of a tension simultaneously? What happened?
- Pick a well-known distributed system (e.g., Cassandra, Spanner, Redis). Which tension did the designers explicitly accept a cost on? Can you find this in their original design papers?

## Canonical Sources

- Feynman, *The Character of Physical Law* — on first principles reasoning
- Kleppmann, *Designing Data-Intensive Applications*, Ch. 1 — on the fundamental properties of data systems
- Brewer, CAP theorem (2000 keynote) — the original formulation of the consistency/availability tension
- Amdahl's Law — the formal statement of the latency/throughput bottleneck
