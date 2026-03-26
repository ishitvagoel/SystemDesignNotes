# The Physics of Distributed Systems

## Why This Exists

Distributed systems are hard to reason about because their failure modes are non-obvious and their behaviour is emergent. Physics provides a set of well-understood, deeply intuitive mental models for exactly this kind of situation — systems where local rules produce global behaviour, and where conservation laws constrain what is possible.

The isomorphisms below are not metaphors to be discarded once you "really understand" the system. They are load-bearing analogies that continue to be predictively useful. When your queue is building up, "backpressure" is not just a pretty word — the fluid dynamics intuition tells you *where the obstruction is* and *what will happen if you don't address it*.

Each isomorphism includes: the physical principle, the system design parallel, where the analogy holds, and where it breaks.

---

## Thermodynamics

### Entropy: Systems Degrade Without Active Maintenance

**Physical principle**: The second law of thermodynamics — in a closed system, entropy (disorder) increases over time. Order requires a continuous input of energy to maintain.

**System design parallel**: Without deliberate maintenance effort, software systems accumulate disorder:
- Databases develop table bloat, dead rows, and index fragmentation (requires `VACUUM`, `REINDEX`)
- Log-structured storage accumulates stale SSTables (requires compaction)
- Schemas drift from their intended constraints (requires migrations)
- Services accumulate undocumented workarounds, deprecated endpoints, and dead feature flags

**Design implication**: Budget for entropy reduction in every system plan. Compaction, garbage collection, schema migrations, and dependency updates are not optional cleanup tasks — they are the energy input that keeps the system ordered. Systems that skip this work do not stay the same; they degrade.

**Where the analogy breaks**: Software systems are not thermodynamically closed, and their "entropy" is not a rigorous physical quantity. Use it as an intuition pump, not a calculation tool.

### Heat Dissipation: Load Generates "Heat" That Must Be Managed

**Physical principle**: Any system doing work generates heat. If heat cannot be dissipated fast enough, the system overheats and fails.

**System design parallel**: Load generates "heat" in the form of latency increases, error rates, and resource exhaustion. If the system cannot dissipate load fast enough, it fails — often catastrophically rather than gracefully.
- **Cooling mechanisms**: caching (reduces repeated computation), load balancing (distributes heat across nodes), backpressure (slows the heat source), circuit breakers (isolate the heat before it propagates)
- **Thermal runaway**: a slow service causes upstream callers to queue, which increases memory pressure, which causes GC pauses, which makes the service slower — a feedback loop to failure

**Design implication**: Every high-load system needs cooling infrastructure sized for peak, not average, load. The absence of a circuit breaker is the absence of thermal insulation — one hot component will heat the whole system.

### Phase Transitions: Systems Don't Degrade Linearly

**Physical principle**: Water at 99°C is still liquid. At 100°C it becomes steam — a discontinuous state change. Small incremental inputs can cause sudden, qualitative transitions.

**System design parallel**: Systems often work fine up to a threshold, then fail suddenly and catastrophically. This is why naive load testing (testing at 1.1x current traffic) is insufficient:
- A database handles 10,000 QPS fine; at 12,000 QPS the connection pool saturates and latency jumps from 5ms to 5,000ms
- A JVM runs at normal GC overhead; cross a heap utilisation threshold and it enters stop-the-world GC loops
- A consensus cluster handles node failures gracefully until it loses quorum, at which point it stops entirely

**Design implication**: Capacity planning must identify the phase-transition threshold, not just the average operating point. Build headroom *before* the transition, and design graceful degradation for operation near it. The threshold is usually sharper than intuition suggests.

---

## Fluid Dynamics

### Backpressure: Upstream Pressure Builds When Downstream is Blocked

**Physical principle**: In a pipe, if the downstream end is blocked or restricted, pressure builds upstream. Without a relief valve, the pipe bursts.

**System design parallel**: If a downstream service cannot process messages as fast as they arrive, the queue grows. If the queue is unbounded, it grows until memory is exhausted. If the queue is bounded, it must either block producers (backpressure propagation) or drop messages (shedding load).
- Queues are reservoirs — they absorb bursts but have finite capacity
- Rate limiters are valves — they control the flow rate into downstream systems
- Reactive streams and async I/O frameworks propagate backpressure automatically up the call chain

**Design implication**: Explicitly design your system's backpressure strategy before deployment. Decide: will you propagate pressure to producers (slowing them down), drop messages (with what visibility?), or expand the queue (to what limit)? Leaving this implicit means the system decides for you — usually via OOM.

### Load Balancing: Flow Distributes Based on Resistance

**Physical principle**: In parallel pipes, fluid flow distributes according to the resistance (impedance) of each path. Lower resistance → more flow.

**System design parallel**: Load balancers distribute traffic across server instances. Round-robin ignores resistance (server load). Least-connections routing is closer to the physical model — it routes to the server with the lowest current "resistance" (connection count).

Consistent hashing is pipe routing that minimises re-routing when pipes are added or removed: instead of rehashing all keys when a node joins/leaves, only the keys "adjacent" to the changed node are remapped. This is analogous to rerouting only the flow that was passing through the affected pipe section.

**Design implication**: Choose your routing algorithm to match the variance in your workload. If all requests are equally expensive, round-robin is fine. If request cost varies widely, least-connections or even weighted routing better matches the fluid model.

### Amdahl's Law: The Narrow Pipe Limits Everything

**Physical principle**: In a series of pipes with different diameters, total throughput is limited by the narrowest section — regardless of how wide the others are.

**System design parallel**: Amdahl's Law states that system speedup is bounded by the fraction of the workload that cannot be parallelised. The "narrow pipe" is the serial bottleneck. Adding more parallel capacity downstream of a bottleneck yields no improvement.

Common narrow pipes:
- A single-threaded event loop handling I/O and CPU-intensive tasks
- A write-heavy workload hitting a single primary database node
- A shared mutex protecting a hot path
- A network link shared between multiple high-bandwidth services

**Design implication**: Profile before optimising. The narrow pipe is often not where you expect it. Optimising a wide section produces no measurable improvement; optimising the narrow section produces dramatic improvement.

---

## Gravity / Attraction

### Data Gravity: Data Attracts Compute

**Physical principle**: Massive objects attract other objects. The larger the mass, the stronger the gravitational pull.

**System design parallel**: Large datasets attract the services that process them. Once a significant volume of data lives in a particular store or region, it becomes expensive to move — the gravitational well is deep. Services then cluster around the data rather than the reverse.

This is why:
- Moving a terabyte Postgres database to a different cloud region is a major project, not a config change
- Analytics workloads are built around S3 (where the data already lives) rather than pulling data to a separate compute cluster
- Feature stores for ML are positioned near training pipelines (which need the data) rather than near the models (which need only inference features)

**Design implication**: Data model decisions and data placement decisions are among the hardest to reverse in a system's lifetime. Treat them as one-way doors (see [[00-Phase-0__Evolving_Designs_Over_Time]]). The gravitational well gets deeper with time.

### Network Effects as Gravitational Binding

**Physical principle**: Gravitational binding energy is the energy required to disperse a gravitationally bound system. More massive systems require more energy to escape.

**System design parallel**: The more nodes integrated with a central service, the more energy (migration cost, coordination, re-implementation) required to escape it. This applies to vendor lock-in, internal platform dependencies, and data format coupling.

**Design implication**: Before adding a deep dependency on a proprietary service or internal platform, estimate the "escape velocity" you are accepting. This is not an argument against dependencies — it is an argument for choosing them consciously.

---

## Wave Propagation

### Eventual Consistency as Wave Propagation

**Physical principle**: Disturbances in a medium propagate at a finite speed. A stone dropped in a pond creates ripples that travel outward — closer points see the disturbance first; far points see it later; all points converge on a new equilibrium eventually.

**System design parallel**: In an eventually consistent distributed system, a write to one node propagates to other nodes at finite speed (limited by network latency and replication fan-out). Nodes closer to the write origin see the update first; remote replicas see it later; all replicas converge eventually.

This is not a bug — it is a fundamental property of information moving at finite speed through a network. Eventual consistency is the honest acknowledgement of wave propagation physics.

**Design implication**: "Eventual consistency" is not a vague hand-wave. It comes with concrete parameters: replication lag (how long until waves propagate?), conflict resolution policy (what happens when two nodes accept conflicting writes?), and read-your-own-writes guarantees (do you need to see your own ripple immediately?). Know your parameters.

### CAP Theorem as the Speed of Light

**Physical principle**: Nothing travels faster than light. Instant global communication is physically impossible — there is always propagation delay between spatially separated points.

**System design parallel**: CAP theorem states that during a network partition, a distributed system cannot simultaneously provide consistency (all nodes return the same data) and availability (every request receives a response). This is not an engineering limitation to be optimised away — it is the distributed systems equivalent of the speed-of-light constraint. Information cannot propagate instantly to all nodes.

**Design implication**: CAP does not mean "pick two." During *normal operation* (no partition), you can have both. The choice is what happens *during a partition* — which is rare but inevitable. Design the partition behaviour explicitly.

---

## Connections

- [[00-Phase-0__First_Principles_Thinking]] — the 5 fundamental tensions these isomorphisms illuminate
- [[00-Phase-0__Requirements_to_Constraints]] — using these models to extract constraints
- [[00-Phase-0__Reasoning_Through_Trade-Offs]] — the equilibrium isomorphism for decision-making
- [[Phase_0_MOC]] — phase overview

## Reflection Prompts

- Pick a recent system failure you know of. Which physical isomorphism best describes the failure mode (phase transition? thermal runaway? narrow pipe)?
- CAP theorem is often taught as "pick two." How does the wave propagation analogy give you a more accurate mental model?
- Where in your current system is the deepest "gravitational well" — the data or service that would be hardest to migrate away from?

## Canonical Sources

- Vogels, "Eventually Consistent" (2009, ACM Queue) — the formal statement of the wave propagation model
- Brewer, "CAP Twelve Years Later" (2012, IEEE Computer) — nuancing beyond the simple "pick two"
- Kleppmann, *Designing Data-Intensive Applications*, Ch. 5 (Replication) and Ch. 9 (Consistency and Consensus)
- Gilbert & Lynch, "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services" (2002)
