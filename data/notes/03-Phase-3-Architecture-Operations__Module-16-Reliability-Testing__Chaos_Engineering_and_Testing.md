# Chaos Engineering and Testing

## Why This Exists

Unit tests verify that code does what you wrote. Integration tests verify that components work together. Neither tests whether your system survives a network partition between the API and the database, a 50% packet loss on the link to Redis, a clock jump of 30 seconds, or a full availability zone failure. These are the failures that cause production outages — and you can't test them with mocked dependencies.

Chaos engineering fills this gap: **deliberately inject failures into the system and observe whether resilience mechanisms (circuit breakers, retries, failover) actually work.** It's the difference between "we have a circuit breaker" and "we've proven the circuit breaker opens in 5 seconds when the database latency exceeds 2 seconds."


## Mental Model

Fire drills for your software. A fire drill doesn't start fires — it simulates one to test whether people know the evacuation routes, whether the alarms work, and whether the fire doors close properly. Chaos engineering does the same: you deliberately inject failures (kill a server, slow the network, fill the disk) to test whether your system's safety mechanisms (circuit breakers, failover, auto-scaling) actually work under real conditions. The key insight is the same as with fire drills: you learn more from one drill than from a hundred safety manuals. If you've never tested your failover, you don't have failover — you have a hope.

## Chaos Engineering Principles

Netflix formalized the discipline in their "Principles of Chaos Engineering":

1. **Start with a hypothesis**: "If the payment service's database latency increases to 5 seconds, the circuit breaker opens within 10 seconds, the checkout flow returns a degraded response (cached price), and the SLO is not breached."

2. **Vary real-world events**: Inject realistic failures — not just "kill a pod," but "add 200ms latency to 10% of database connections" or "return 503 from the auth service for 30 seconds." Real failures are rarely total; they're partial, intermittent, and correlated.

3. **Run experiments in production**: Staging environments don't have real traffic patterns, real data volumes, or real dependency chains. Production is the only environment where chaos experiments produce trustworthy results. BUT: start with blast-radius-limited experiments.

4. **Automate experiments**: Chaos experiments should be repeatable and schedulable. Run them regularly (weekly) to catch regressions. A resilience mechanism that worked in January might be broken by a March refactor.

### Failure Injection Types

| Failure Type | Injection Method | What It Tests |
|-------------|-----------------|---------------|
| Instance termination | Kill a pod/VM randomly | Auto-scaling, health checks, stateless design |
| Network latency | `tc qdisc` adding 500ms delay | Timeouts, circuit breakers, retry budgets |
| Network partition | iptables rules blocking traffic | Failover, split-brain handling, quorum behavior |
| CPU/memory stress | `stress-ng` consuming resources | Autoscaling, OOM handling, graceful degradation |
| Disk I/O saturation | `fio` filling I/O bandwidth | Database performance, WAL flush delays |
| DNS failure | Override DNS resolution | Fallback behavior, cached DNS handling |
| Clock skew | `chrony` manipulation | Lease expiry, certificate validation, HLC behavior |
| Dependency failure | Return errors from a downstream service | Circuit breaker, fallback responses, error handling |

### Blast Radius Control

**Start small**: Inject failures affecting a single instance, not the whole cluster. In [[Cell-Based Architecture]], inject into one cell.

**Monitor continuously**: Watch SLIs (latency, error rate) throughout the experiment. Define abort conditions: "if p99 latency exceeds 2× baseline or error rate exceeds SLO, stop immediately."

**Progressive expansion**: Single instance → one AZ → one region → cross-region. Each level of expansion is a separate experiment, validated before proceeding.

**Tools**: Chaos Monkey (Netflix — random instance termination), Gremlin (commercial — comprehensive fault injection with safety controls), Litmus Chaos (Kubernetes-native), Toxiproxy (network fault simulation for integration testing).

## Other Testing Strategies for Distributed Systems

### Contract Testing (Pact)

In microservices, Service A calls Service B's API. If B changes its response format, A breaks. Unit tests on A mock B's response — they don't catch the schema change. Contract testing catches it.

**How it works**: The consumer (A) defines a contract: "I expect B's `/users/123` to return `{name: string, email: string}`." The provider (B) verifies the contract against its actual implementation. If B's response no longer matches, the contract test fails — before B is deployed.

**Consumer-driven contracts**: The consumer defines what it needs. The provider ensures it delivers. This prevents providers from accidentally breaking consumers they don't know about.

### Property-Based Testing

Instead of writing specific test cases (`add(2, 3) == 5`), define properties that should always hold (`for any a, b: add(a, b) == add(b, a)`). The framework generates thousands of random inputs and verifies the property.

**For distributed systems**: "For any sequence of put/get operations, a linearizable store always returns the most recently written value." The framework generates random operation sequences, including concurrent operations, and verifies linearizability. Libraries: Jepsen (distributed system correctness testing), QuickCheck (Erlang), Hypothesis (Python).

**Jepsen** deserves special mention: Kyle Kingsbury's Jepsen tests have found consistency bugs in nearly every major distributed database (Postgres, MongoDB, CockroachDB, Redis, Cassandra, etcd). Jepsen injects failures (network partitions, process pauses, clock skew) during concurrent operations and verifies that the database's consistency guarantees actually hold. Many bugs found by Jepsen were undetectable by conventional testing.

### Load Testing

Verify that the system handles expected peak load with acceptable latency.

**Synthetic load**: Generate artificial traffic matching production patterns (same endpoint distribution, same payload sizes, same think times). Tools: k6 (JavaScript-based, developer-friendly), Locust (Python), Gatling (Scala/JVM).

**Production traffic replay**: Record production traffic, replay it against a staging environment at 2–5× speed. More realistic than synthetic load but harder to set up.

**Shadow testing** (dark launch): Route a copy of production traffic to a new version of the service. Compare the new version's responses and latency to the current version. No user impact — the shadow responses are discarded. This catches performance regressions and correctness bugs under real traffic.

### Formal Verification (TLA+)

For critical algorithms (consensus protocols, distributed lock implementations), specify the algorithm's behavior mathematically in TLA+ and use a model checker (TLC) to verify safety properties hold across all possible execution paths.

**Why this matters**: Testing checks specific executions. Formal verification checks ALL possible executions — including rare race conditions that testing would never trigger. Amazon used TLA+ to find bugs in DynamoDB, S3, and EBS that had survived years of testing.

**Practical entry point**: The MIT 6.5840 (formerly 6.824) distributed systems course teaches TLA+ alongside Raft implementation. Hillel Wayne's "Practical TLA+" is the most accessible book introduction.

## Trade-Off Analysis

| Approach | Risk | Realism | Coverage | Best For |
|----------|------|---------|----------|----------|
| Unit/integration tests for failure paths | None — runs in test | Low — simulated failures | Narrow — individual components | Every service — table stakes |
| Staged fault injection (non-production) | Low — staging only | Moderate — not real traffic | Moderate | Validating failure handling before production |
| Production chaos (Chaos Monkey style) | Medium — real user impact possible | Highest — real traffic, real systems | Broad — discovers emergent failures | Mature organizations with blast radius controls |
| Game days (planned exercises) | Low-Medium — controlled with observers | High — real systems, planned scenarios | Targeted | Building incident response muscle, testing runbooks |
| Load testing with fault injection | Low — controlled environment | Moderate-High | Performance under failure | Capacity planning, SLO validation |

**Chaos without observability is just destruction**: Before injecting faults in production, you need: distributed tracing, metric dashboards, automated alerts, and runbooks. You also need blast radius controls — start with a single availability zone, a single percentage of traffic, and automatic abort if error rates exceed a threshold. Netflix built years of observability tooling before Chaos Monkey was useful.

## Failure Modes of Testing Itself

- **Chaos fatigue**: Experiments run so frequently that engineers ignore the results. Mitigation: tie chaos results to SLO reporting — a failed chaos experiment consumes error budget.
- **Staging-only chaos**: "We run chaos in staging." Staging doesn't reproduce production's traffic patterns, data volumes, or infrastructure quirks. Chaos in staging gives false confidence. Mitigation: run in production with strict blast radius controls.
- **Testing the happy path of failure**: Chaos experiments always kill the same pod type. Real outages are correlated failures (an AZ goes down, a shared dependency fails, a config change breaks everything). Mitigation: design multi-failure experiments and simulate cascading failures.

## Connections

- [[Resilience Patterns]] — Chaos engineering verifies that circuit breakers, bulkheads, and retries work
- [[SLOs SLIs and Error Budgets]] — Chaos experiments should be bounded by error budget
- [[Deployment and Release Engineering]] — Shadow testing and canary analysis catch regressions before they reach users

## Reflection Prompts

1. Your team runs chaos experiments in staging but has never run one in production (management is nervous). Design a production chaos experiment with minimal risk: what failure do you inject, what's the blast radius, what are the abort conditions, and what do you expect to learn?

2. Jepsen found that under network partitions, a popular database's "serializable" isolation level actually allows stale reads. Your team uses this database for financial transactions. How do you assess whether this bug affects your system? What compensating controls could you add?

## Canonical Sources

- Netflix, "Principles of Chaos Engineering" (principlesofchaos.org) — the foundational document
- Kingsbury, "Jepsen" (jepsen.io) — consistency analyses of every major distributed database
- Newcombe et al., "How Amazon Web Services Uses Formal Methods" (2015) — TLA+ at AWS
- Hillel Wayne, *Practical TLA+* — accessible introduction to formal verification
- *Site Reliability Engineering* (Google SRE book) — testing and capacity validation chapters