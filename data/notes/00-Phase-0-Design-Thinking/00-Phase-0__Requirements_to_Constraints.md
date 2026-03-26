# Requirements to Constraints

## Why This Exists

Vague requirements produce arbitrary architectures. "The system needs to be fast and reliable" could justify almost any design. Concrete constraints eliminate most options before you start and make the remaining choice obvious.

The discipline of requirements-to-constraints is the conversion process: taking the prose specification a product manager or interview prompt gives you and extracting the numerical, structural constraints that actually determine which architecture wins.

## Mental Model

> **If the numbers don't matter, the decision doesn't depend on scale. If the numbers DO matter, you need them before choosing.**

Constraints are not obstacles — they are gifts. Every constraint you identify eliminates options you don't have to evaluate. The more constrained the problem, the fewer viable solutions remain, and the more defensible your choice becomes.

## Functional vs Non-Functional Requirements

| Type | Definition | Example | Drives |
|------|-----------|---------|--------|
| Functional | What the system does | "Users can send messages to other users" | Features, API surface |
| Non-functional | How the system performs | "99.9% of messages delivered within 100ms" | Infrastructure, architecture |

**Key insight**: Non-functional requirements drive architecture. You can implement the same feature with a monolith, microservices, event sourcing, or any other pattern — the functional requirement is silent on this. The non-functional requirements (latency budget, throughput target, consistency guarantee, availability SLA) are what discriminate between architectural options.

Most "design discussion" failures stem from spending 80% of the time on functional requirements and 20% on non-functional, when the ratio should be reversed.

## The 6 Constraint Extraction Dimensions

For any system, extract a number (or clear category) along each of these dimensions before discussing architecture.

### 1. Read/Write Ratio → Storage and Caching Strategy

- **Read-heavy** (>10:1): caching is high-leverage; read replicas worthwhile; denormalisation acceptable
- **Write-heavy** (>1:10): caching is less effective; write path is the bottleneck; log-structured storage (LSM trees) often preferred over B-tree
- **Balanced**: neither extreme; standard OLTP patterns apply

*Ask*: "Are there more reads or writes? By roughly how much?"

### 2. Data Volume and Growth Rate → Storage Engine and Sharding Timeline

- How much data exists today?
- What is the growth rate (GB/day, rows/day)?
- What does the data look like in 1 year? 3 years?
- Does the working set fit in memory today? In one year?

*Decision gates*: If data fits in memory → in-process caching viable. If data exceeds a single disk → sharding enters scope. If growth rate is exponential → architect for sharding from day one even if not needed today.

### 3. Latency Budget → Cache Placement and Network Hops

- What is the maximum acceptable p99 latency for user-facing requests?
- How many network hops does the current design add?
- Rule of thumb: each network hop adds ~1ms (within a data centre) to ~100ms (cross-region)

| Latency budget | What it implies |
|----------------|-----------------|
| < 10ms | Data must be in memory; no cross-region calls on the hot path |
| 10–100ms | One or two network hops acceptable; caching required for db access |
| 100ms–1s | Multiple hops acceptable; synchronous cross-region calls possible |
| > 1s | Asynchronous processing acceptable; queue-based architecture viable |

### 4. Consistency Requirements → Replication Strategy

- What happens if two users read different values for the same data simultaneously?
- What happens if a write is lost?

| Requirement | Replication model |
|-------------|-------------------|
| Strong consistency required | Synchronous replication; leader-based writes; accept latency cost |
| Eventual consistency acceptable | Async replication; leaderless or multi-leader; accept stale reads |
| Read-your-own-writes required | Session consistency; route reads to primary for the session owner |

*Examples*: Bank balances, inventory counts → strong. Social media likes, view counts → eventual. User's own profile → read-your-own-writes.

### 5. Availability Target → Redundancy and Failover Design

- What is the SLA (99.9%? 99.99%? 99.999%)?
- What is the tolerable downtime per month/year?

| SLA | Downtime/month | Implication |
|-----|---------------|-------------|
| 99% | ~7h 18m | Single instance acceptable for non-critical paths |
| 99.9% | ~43m | Active-passive failover required |
| 99.99% | ~4m | Active-active multi-region required |
| 99.999% | ~26s | Continuous availability; no single points of failure anywhere |

*Note*: Each nine costs roughly an order of magnitude more in complexity and cost than the previous.

### 6. Cost Ceiling → Build vs Buy, Cloud vs Self-Hosted

- What is the monthly infrastructure budget?
- Is engineering time cheaper than cloud spend, or vice versa?
- Are there regulatory constraints forcing on-premise or specific regions?

This constraint is often skipped in design discussions but is frequently the binding one in production. A $500/month budget eliminates managed Kafka, managed Elasticsearch, and most multi-region configurations before you start.

---

## Identifying the Dominant Constraint

After extracting numbers along all 6 dimensions, one constraint will typically eliminate 80% of architectural options. This is the **dominant constraint**.

**Isomorphism**: In physics optimisation, the binding constraint is the one inequality that is active at the optimal solution — all others have slack. Your dominant constraint is the binding constraint of your system design optimisation problem.

To find it: for each constraint, ask "how many architectural options does this eliminate?" The constraint that eliminates the most options is dominant. Your architecture should be explicitly designed around satisfying it; other constraints are secondary.

**Example**: If latency budget is 50ms and you're cross-region, everything must fit in regional caches — that single constraint may eliminate NoSQL options with high read latency, eliminate synchronous cross-region calls, and mandate a cache-aside pattern. Latency is dominant.

---

## Back-of-Envelope Estimation as a Decision Tool

Back-of-envelope calculations are often taught as an interview skill. They are also a *decision-making* tool: they tell you whether your constraints are in the regime where a particular solution is viable.

**Key estimates to know**:

| Operation | Approximate latency |
|-----------|---------------------|
| L1 cache reference | 0.5 ns |
| L2 cache reference | 7 ns |
| Main memory reference | 100 ns |
| SSD sequential read (1 MB) | 1 ms |
| Network round trip (same DC) | 0.5–1 ms |
| Network round trip (cross-region) | 50–150 ms |
| Disk seek | 10 ms |

**How to use it**: If your latency budget is 10ms and your design requires 3 cross-datacenter hops, back-of-envelope tells you immediately that the design is impossible as specified — before you spend an hour detailing the architecture.

---

## Worked Example: Notification System

**Requirements (vague)**: "Design a notification system that sends emails and push notifications to users when events happen in our app."

**Constraint extraction**:

| Dimension | Question asked | Answer extracted | Implication |
|-----------|---------------|-----------------|-------------|
| Read/write | How many events per second? | ~5,000 events/sec peak | Write-heavy; queuing required |
| Data volume | How long do we retain notification history? | 90 days; ~1M users × 10 notifs/day | ~900M rows/90 days; ~50 GB at 50 bytes/row |
| Latency budget | How fast must a notification arrive after the event? | Email: within 60s; push: within 5s | Push is near-real-time; email can be batched |
| Consistency | What if we send a notification twice? | Annoying but acceptable | At-least-once delivery acceptable; idempotent delivery nice-to-have |
| Availability | What happens if notifications are delayed during a DB outage? | Delay acceptable, loss unacceptable | Durable queue required; in-memory-only buffers out |
| Cost | Monthly budget? | $800/month | Managed Kafka out; self-hosted Redis Streams or SQS viable |

**Dominant constraint**: Durability (loss unacceptable) + push latency (5s). These two together mandate a durable queue that can be consumed with low latency — a managed queue (SQS, Google Pub/Sub) or self-hosted Redis Streams fits; a database-backed polling approach does not.

**Design direction**: Event producers → durable queue → fanout workers (push vs email) → delivery APIs. The queue must persist to disk (durability) and have < 5s consumer lag on the push path.

---

## Connections

- [[00-Phase-0__First_Principles_Thinking]] — the 5 tensions that constraints map onto
- [[00-Phase-0__Reasoning_Through_Trade-Offs]] — what to do once you have the dominant constraint
- [[00-Phase-0__Decision_Frameworks_in_Practice]] — worked examples applying constraint extraction
- [[Phase_0_MOC]] — phase overview

## Reflection Prompts

- Take any design you've worked on recently. Go through the 6 dimensions. Were all 6 explicitly discussed before the architecture was chosen?
- What was the dominant constraint? Was the architecture optimised for it?
- Have you ever seen a system where the cost constraint was ignored, leading to a design that was technically correct but economically unsustainable?

## Canonical Sources

- Kleppmann, *Designing Data-Intensive Applications*, Ch. 1 — reliability, scalability, maintainability as foundational non-functional requirements
- Dean & Ghemawat, "MapReduce" (2004) — a masterclass in identifying and designing for the dominant constraint (throughput of batch jobs over commodity hardware)
- Jeff Dean's latency numbers (2012) — the canonical back-of-envelope reference
