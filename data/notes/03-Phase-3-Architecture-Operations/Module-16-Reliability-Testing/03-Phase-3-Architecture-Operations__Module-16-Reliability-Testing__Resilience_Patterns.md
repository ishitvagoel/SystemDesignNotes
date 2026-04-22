# Resilience Patterns

## Why This Exists

In a distributed system, partial failures are the norm. A downstream service is slow. A database connection pool is exhausted. A network partition isolates a cluster. Resilience patterns ensure these partial failures don't cascade into total system failure.


## Mental Model

A building's structural safety systems. A **circuit breaker** is a fuse box — it trips to prevent electrical fire from spreading. A **bulkhead** is a firewall between apartments — a fire in apartment 3 doesn't spread to apartment 4. A **timeout** is a fire door that closes automatically — it doesn't wait forever for the fire to stop. A **retry with backoff** is knocking on a door, waiting, knocking louder, waiting longer — not hammering continuously. **Load shedding** is a bouncer turning people away when the venue is at capacity — better to serve 80% of users well than 100% of users badly. These patterns compose: the fuse box protects the wiring, the firewall contains the damage, the fire door limits the duration.

## The Patterns

### Circuit Breaker

Wraps a remote call. Tracks failures. When failures exceed a threshold, the circuit "opens" — subsequent calls fail immediately without attempting the remote call (fast failure). After a timeout, the circuit enters "half-open" — one test request is allowed. If it succeeds, the circuit closes (normal operation). If it fails, the circuit reopens.

**Why it matters**: Without a circuit breaker, a failing downstream service causes your service to accumulate waiting requests, exhaust threads/connections, and eventually fail too — cascading failure. The circuit breaker cuts the dependency and returns an error (or a fallback) immediately.

**Key parameters**: Failure threshold (5 failures in 10 seconds), reset timeout (30 seconds in open state), half-open test count (1 request).

### Bulkhead

Isolates resources for different operations or dependencies. If one dependency exhausts its resource pool, other dependencies are unaffected.

**Implementation**: Separate thread pools (or connection pools, or semaphores) per downstream dependency. The payment service gets 20 threads. The recommendation service gets 10 threads. If the recommendation service is slow and its 10 threads are blocked, the payment service's 20 threads are still available.

**Without bulkheads**: All downstream calls share one thread pool. One slow dependency consumes all threads. Every downstream call fails — even to healthy dependencies.

### Retries with Exponential Backoff + Jitter

When a call fails, retry after a delay. Increase the delay exponentially (1s, 2s, 4s, 8s). Add random jitter to prevent synchronized retries.

**Why jitter is critical**: Without jitter, if 100 clients fail simultaneously, they all retry after 1 second, then after 2 seconds, then after 4 seconds — in synchronized waves. The server sees periodic traffic spikes (thundering herd). Jitter desynchronizes retries, spreading load evenly.

```
delay = min(base * 2^attempt + random(0, base * 2^attempt), max_delay)
```

**Retry budget**: Limit total retries as a percentage of traffic (e.g., retries ≤ 10% of requests). If everything is being retried, something is fundamentally broken — more retries make it worse, not better.

### Graceful Degradation

When a dependency is unavailable, serve a degraded response rather than failing entirely. The recommendation service is down? Show popular products instead of personalized recommendations. The CDN is unavailable? Serve images from the origin (slower but functional).

**Feature flags as circuit breakers**: Use feature flags to disable non-essential features under load. Turn off the "recently viewed" section during a traffic spike to reduce backend calls.

### Load Shedding

When the system is overloaded, reject excess requests rather than trying to serve them all (and degrading performance for everyone). Return 503 with `Retry-After`.

**Priority-based shedding**: Shed low-priority requests first. Paid users' requests proceed; free-tier users get 503. Monitoring/health-check requests are never shed.

### Back-Pressure

Instead of the server absorbing unlimited requests (and eventually failing), push the overload signal back to the producer. The producer slows down.

**Pull-based consumption**: The consumer requests messages at its own pace (Kafka consumer model). The queue/log absorbs the surplus. The producer isn't affected.

**Adaptive concurrency limits**: The server dynamically adjusts its concurrency limit based on observed latency. As latency increases (sign of overload), the concurrency limit decreases, rejecting new requests earlier. Netflix's concurrency-limits library implements this.

## Cascading Failure Analysis

The most dangerous failure mode in distributed systems: failure in one service causes failure in dependent services, which causes failure in their dependents, and so on. The entire system collapses like dominoes.

**Common causes**: A slow service causes callers to accumulate waiting requests → thread/connection pool exhaustion → callers become slow → their callers accumulate waiting requests → cascade.

**Prevention**: Circuit breakers (fast failure), bulkheads (isolation), timeouts (don't wait forever), retries with budget (don't amplify load), load shedding (reject before overload), and capacity planning (N+1 redundancy).

## Trade-Off Analysis

| Pattern | What It Protects Against | Overhead | Risk | Best For |
|---------|------------------------|---------|------|----------|
| Retry with backoff | Transient failures (network blips, 503s) | Low — delayed responses | Retry storms if not jittered | Idempotent operations, upstream transient errors |
| Circuit breaker | Cascading failures from a down dependency | Low — state machine per dependency | Open circuit = temporary unavailability | Service-to-service calls, database connections |
| Bulkhead (resource isolation) | One component exhausting shared resources | Medium — resource partitioning | Under-utilization of isolated pools | Multi-tenant systems, critical vs non-critical paths |
| Timeout | Hung connections, slow dependencies | Minimal | Too short = false failures; too long = thread exhaustion | Every external call — table stakes |
| Fallback / graceful degradation | Dependency failure | Medium — maintain fallback logic | Stale or reduced-quality response | User-facing features with tolerable degradation |
| Shed load (admission control) | Overload beyond capacity | Low — reject early | Dropped requests during peak | API gateways, high-traffic services |

**Timeouts are the most underrated resilience pattern**: Every network call without a timeout is a potential thread leak. A downstream service that hangs for 30 seconds while your timeout is infinite means your thread pool fills up, and your service becomes unresponsive to all requests — not just the ones calling the slow dependency. Set timeouts on every external call: HTTP, database, cache, DNS. Make them explicit, not default.

## Failure Modes

**Retry storm amplifying outages**: A downstream service returns 503s. Every upstream caller retries 3 times with no backoff. The downstream, already overloaded, receives 3x the normal traffic, pushing it further into failure. The retries make the outage worse, not better. Solution: exponential backoff with jitter (each retry waits longer, with randomization to prevent synchronization), circuit breakers that stop retries when failure rate exceeds a threshold.

**Circuit breaker stuck open**: A circuit breaker trips open after a transient failure. The downstream recovers, but the circuit breaker's half-open probing is too conservative — it sends one test request every 30 seconds. The downstream is healthy but the circuit breaker stays mostly open for minutes. Solution: tune half-open probe rate to match recovery expectations, use health check endpoints for probing (faster, cheaper), and implement a forced-reset mechanism.

**Bulkhead misconfiguration causing starvation**: A bulkhead allocates 10 threads to a critical dependency and 5 to a non-critical one. Under normal load, the critical dependency needs only 3 threads, wasting 7. Under peak load, 10 isn't enough, and requests are rejected despite idle threads in the non-critical pool. Solution: size bulkheads based on peak load measurements, use semaphore-based bulkheads (more flexible than thread pools), and monitor rejection rates.

**Timeout chain multiplication**: Service A calls B (timeout: 5s), B calls C (timeout: 5s). If C is slow, B waits 5 seconds, then A waits another 5 seconds for B. Total wait: 10 seconds. With deeper chains, timeouts multiply. Solution: set end-to-end timeout budgets and propagate remaining budget downstream. B should give C at most (A's timeout - B's processing time).

**Fallback masking real failures**: A service falls back to cached data when the primary data source is down. The fallback works so well that nobody notices the primary has been down for 3 days. The cache becomes increasingly stale. Solution: alert on fallback activation, track fallback duration, and set a maximum fallback window after which the fallback degrades gracefully rather than serving ancient data.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Resilient Client (Service A)"
        A_App[App Logic] --> TO[Timeout: 500ms]
        TO --> RET[Retry: 3x Backoff/Jitter]
        RET --> CB{Circuit Breaker}
        CB --> BH((Bulkhead: Pool 10))
    end

    subgraph "Downstream (Service B)"
        BH -->|Success| SvcB[Service B]
        BH -->|Failure/Slow| FB[Fallback: Cached Data]
    end

    CB -- "Threshold > 50%" --> Open[OPEN: Fast Fail]
    style CB fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style BH fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Timeout Formula**: `Average Latency + (4 * Standard Deviation)`. This usually captures 99% of normal requests without failing too early.
- **Retry Budget**: Limit retries to **< 10%** of total request volume to avoid "Retry Storms" that amplify outages.
- **Circuit Breaker Window**: Use a **10 - 60 second** sliding window. Windows too short are noisy; windows too long react too slowly to recovery.
- **Jitter Strategy**: Use **Full Jitter** (`random(0, delay)`) rather than Equal Jitter. It provides the best desynchronization for thundering herds.

## Real-World Case Studies

- **Amazon (Prime Day Load Shedding)**: During Prime Day, Amazon's "Recommendations" and "Related Products" services are often the first to be **shed**. If latency on these non-critical services spikes, the API gateway simply returns an empty list (Fallback), preserving all available CPU and database IOPS for the critical "Add to Cart" and "Checkout" flows.
- **Google (The 2014 Gmail Outage)**: A bug in a routine load-balancing change caused a massive **Cascading Failure** in Gmail. A small cluster became overloaded, shed its traffic to the next cluster, which then became overloaded and shed to the next, like falling dominoes. This incident led to the widespread adoption of **L7 Load Shedding** and tighter circuit breaker integration across Google's infrastructure.
- **Netflix (Hystrix/Resilience4j)**: Netflix famously open-sourced **Hystrix**, which brought the Circuit Breaker pattern to the mainstream. They used it to isolate over 500 downstream microservices. They found that by wrapping every remote call in a circuit breaker with a fallback, they could maintain 99.99% availability even if dozens of individual microservices were failing simultaneously.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__SLOs_SLIs_and_Error_Budgets]] — Resilience patterns help you stay within SLO
- [[01-Phase-1-Foundations__Module-02-API-Design__Rate_Limiting_and_Throttling]] — Rate limiting prevents consumers from overloading; resilience patterns prevent dependencies from dragging you down
- [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]] — Health checks remove unhealthy backends; circuit breakers handle slow backends
- [[01-Phase-1-Foundations__Module-01-Networking__Connection_Pooling_and_Keep-Alive]] — Pool exhaustion is a primary cascading failure vector

## Reflection Prompts

1. Your service calls three downstream dependencies: a database, a cache, and an external payment API. Each has different failure characteristics — the database is slow but reliable, the cache is fast but occasionally unavailable, the payment API has variable latency (50ms p50, 5s p99). Design the timeout, retry, and circuit breaker configuration for each, and explain why a one-size-fits-all policy would be wrong.

2. During a load test, you discover that your circuit breaker opens after 5 failures in 10 seconds. But the downstream service has a 2% baseline error rate under normal load. With 500 requests/second, that's 10 errors/second — the circuit breaker opens constantly during normal operation. How would you reconfigure it, and what metrics should drive the circuit breaker's threshold?

3. Your service implements graceful degradation: when the recommendation engine is down, product pages show "Popular Items" instead of personalized recommendations. This works well for 1-hour outages. But the recommendation engine has been down for 3 days and nobody noticed because the fallback "works." Users are seeing increasingly stale popular items. How would you design the degradation system to prevent this from happening?

## Canonical Sources

- *Site Reliability Engineering* (Google SRE book) — Chapters on handling overload and cascading failures
- Michael Nygard, *Release It!* (2nd ed) — the definitive book on stability patterns (circuit breakers, bulkheads, timeouts)
- Netflix Tech Blog, "Performance Under Load" — adaptive concurrency limiting