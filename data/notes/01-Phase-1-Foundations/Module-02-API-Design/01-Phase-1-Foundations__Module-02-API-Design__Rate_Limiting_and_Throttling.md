# Rate Limiting and Throttling

## Why This Exists

Every service has a capacity ceiling. Without rate limiting, a single misbehaving client — a buggy retry loop, a misconfigured batch job, a DDoS attack — can consume all available capacity and make the service unavailable for everyone else. Rate limiting is the bouncer at the door: it ensures no single consumer takes more than their fair share.

But rate limiting isn't just about protection from abuse. It's a resource allocation mechanism. Different consumers get different quotas based on their plan, their priority, or their contract. It enables multi-tenancy, monetization (free tier = 100 req/min, pro tier = 10,000 req/min), and graceful degradation under load.

## Mental Model

Think of rate limiting like a tap dispensing water at a fixed flow rate. The tank behind it (your service) can only refill so fast. If one person opens their tap fully (a traffic spike), the pressure drops for everyone. Rate limiting puts individual flow restrictors on each tap — no single consumer can drain the system.

## How It Works

### Core Algorithms

#### Token Bucket

The most common and most flexible algorithm. Imagine a bucket that holds `B` tokens. Tokens are added at a fixed rate of `R` tokens per second. Each request costs one token. If the bucket has tokens, the request proceeds and a token is removed. If the bucket is empty, the request is rejected (or queued).

**Key properties**:
- **Burst tolerance**: A full bucket (`B` tokens) allows a burst of `B` requests instantly. This is the key advantage — it accommodates natural traffic spikes while enforcing an average rate.
- **Two knobs**: Rate `R` controls sustained throughput. Bucket size `B` controls burst capacity. `R=100/sec, B=200` means: sustained 100 req/sec, with bursts up to 200.
- **Simple to implement**: A timestamp and a counter. On each request: add tokens for elapsed time since last request, cap at `B`, then decrement.

```
state: { tokens: B, last_refill: now }

on_request():
    elapsed = now - last_refill
    tokens = min(B, tokens + elapsed * R)
    last_refill = now
    if tokens >= 1:
        tokens -= 1
        return ALLOW
    else:
        return REJECT
```

#### Sliding Window Log

Track the timestamp of every request in a window. Count requests in the last N seconds. If count exceeds the limit, reject.

**Accurate** — no boundary-burst problems. **Expensive** — storing every timestamp uses memory proportional to the rate limit × window size. At 10,000 req/sec with a 60-second window, you're storing 600,000 timestamps per consumer.

#### Sliding Window Counter

A compromise. Divide time into fixed windows (e.g., 1-minute buckets). For the current time, compute a weighted count: `previous_window_count × overlap_fraction + current_window_count`. This approximates the sliding window without storing individual timestamps.

Example: limit is 100 requests per minute. Current window (0:01:00–0:02:00) has 40 requests. Previous window (0:00:00–0:01:00) had 80 requests. At time 0:01:15 (25% into current window), estimated count = `80 × 0.75 + 40 = 100`. Next request is rejected.

**Good enough for most use cases.** Memory-efficient (two counters per consumer per window). Slight approximation at window boundaries.

#### Fixed Window Counter

The simplest: count requests in fixed time windows (e.g., per minute). Reset at the window boundary.

**The boundary burst problem**: A consumer sends 100 requests at 0:00:59 (end of window 1) and 100 at 0:01:00 (start of window 2). They've sent 200 requests in 2 seconds, double the rate, but both windows show only 100. Sliding window algorithms solve this.

### Algorithm Comparison

| Algorithm | Memory | Accuracy | Burst Handling | Complexity |
|-----------|--------|----------|----------------|------------|
| Token bucket | O(1) per key | High | Controlled burst allowed | Low |
| Sliding window log | O(N) per key | Exact | No bursts | Medium |
| Sliding window counter | O(1) per key | Approximate | Slight boundary burst | Low |
| Fixed window counter | O(1) per key | Approximate | Boundary burst problem | Lowest |

**For most production systems, token bucket is the right choice.** It's simple, memory-efficient, and the burst parameter is genuinely useful for accommodating real-world traffic patterns.

### Rate Limiting Dimensions

Rate limiting by different keys serves different purposes:

- **Per-user/API key**: The most common. Each authenticated consumer gets their own quota. Prevents any single user from hogging resources.
- **Per-IP**: Useful for unauthenticated endpoints (login pages, public APIs). Less accurate — users behind NAT or VPNs share an IP.
- **Per-endpoint**: Different limits for different operations. `GET /users` might allow 1,000 req/min; `POST /users` might allow 10 req/min. Expensive write operations deserve tighter limits.
- **Per-tenant**: In multi-tenant systems, each tenant (organization, account) gets a limit regardless of how many individual users they have. See [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Multi-Tenancy_and_Isolation]].
- **Global**: A hard cap on total system throughput. Last line of defense before overload.

These can be layered: a request must pass per-user AND per-IP AND per-endpoint AND global limits.

### Distributed Rate Limiting

On a single server, rate limiting is trivial — a local counter in memory. When your service runs on 20 instances behind a load balancer, the problem changes: how do you enforce a global limit of 100 req/sec per user when requests are distributed across instances?

**Option 1: Centralized counter (Redis)**

All instances check and increment a shared counter in Redis. `INCR` + `EXPIRE` for fixed windows, or a Lua script for token bucket logic.

Pros: Accurate, consistent. The standard approach.
Cons: Every request makes a Redis roundtrip (adds 1–5ms latency). Redis becomes a dependency and potential SPOF. At very high request rates, Redis itself can become a bottleneck.

**Option 2: Local rate limiting with over-provisioning**

Each instance enforces `limit / num_instances` locally. If you have 20 instances and a 1,000 req/sec limit, each instance allows 50 req/sec.

Pros: No external dependency, zero added latency.
Cons: Uneven traffic distribution means some instances reject while others have headroom. If instances scale up/down, limits need recalculation. A consumer whose traffic happens to concentrate on one instance gets a worse deal.

**Option 3: Sliding window with periodic sync**

Each instance counts locally and periodically syncs with a central store. Between syncs, limits are approximate.

Pros: Low latency, reasonable accuracy, tolerates central store outages.
Cons: Can overshoot by `sync_interval × num_instances × local_rate`. Good enough for many use cases.

**In practice**: Redis-backed centralized limiting is the industry standard for per-user/per-key limits. Local limiting is used as a coarse safety net (per-instance circuit breaker). The latency penalty of a Redis call is usually acceptable compared to the cost of a rate-limit bypass.

### Client-Facing Response Design

When a request is rate-limited, the response should help the client recover gracefully:

**HTTP status**: `429 Too Many Requests`

**Headers** (following the IETF draft-ietf-httpapi-ratelimit-headers standard):
- `RateLimit-Limit: 100` — max requests per window
- `RateLimit-Remaining: 0` — requests left in current window  
- `RateLimit-Reset: 1678886400` — Unix timestamp when the window resets
- `Retry-After: 30` — seconds until the client should retry

**Response body**: A clear message explaining the limit and how to increase it.

Good clients use `Retry-After` for backoff. Bad clients ignore it and hammer even harder — which is why server-side enforcement is essential regardless of client behavior.

## Trade-Off Analysis

| Algorithm | Burst Handling | Memory | Precision | Best For |
|-----------|---------------|--------|-----------|----------|
| Fixed window | Allows 2x burst at window boundary | O(1) per key | Low — boundary spike problem | Simple analytics, non-critical limits |
| Sliding window log | Exact — no boundary spikes | O(N) per key (stores timestamps) | Perfect | Low-volume, high-precision limits (auth) |
| Sliding window counter | Weighted approximation, rarely exceeds by >1% | O(1) per key | High — close to exact | General-purpose API rate limiting |
| Token bucket | Allows configured burst, then steady rate | O(1) per key | Good | APIs needing burst tolerance (AWS, Stripe) |
| Leaky bucket | Smooths bursts into steady output | O(1) per key + queue | Good | Traffic shaping, output smoothing |
| Adaptive / concurrency-based | Dynamic — adjusts to backend health | O(1) per key | Contextual | Internal service-to-service, auto-scaling |

**Local vs distributed rate limiting**: Local counters (per-instance) are fast but let N × limit through when you have N instances. Distributed counters (Redis, memcached) give global accuracy but add a network hop per request. The hybrid approach — local fast path with periodic sync to a central counter — gives both speed and approximate global enforcement.

## Failure Modes

- **Rate limiter as SPOF**: Centralized Redis-based rate limiting means Redis going down either (a) blocks all requests or (b) allows unlimited requests. Decision: fail open (allow all) or fail closed (block all)? Most systems fail open — it's better to absorb a temporary traffic spike than to reject all legitimate traffic. But for security-critical limits (brute-force login protection), fail closed is safer.

- **Clock skew in distributed windows**: If instances have slightly different clocks, window boundaries don't align. A request might be counted in window N on one instance and window N+1 on another. Mitigation: use a centralized time source (Redis `TIME`) or tolerate the small inaccuracy.

- **Hot key problem**: One consumer generates 100× more traffic than others. Their rate limit key (`user:whale_customer`) becomes a hot key in Redis. Mitigation: local caching of the current count, batched increments, or dedicated rate limit shards for hot keys.

- **Rate limiting the wrong thing**: Limiting by IP when your biggest consumers are behind a corporate NAT (all appear as one IP). Or limiting by user ID when a bot attack uses thousands of stolen API keys. The limiting dimension must match the abuse vector.

## Architecture Diagram

```mermaid
graph TD
    Client[Client Request] --> Gateway[API Gateway / Envoy]
    
    subgraph "Rate Limiter Logic"
        Gateway -- "1. Check Limit (Key: UserID)" --> Redis{Redis Cluster}
        Redis -- "2. Increment & TTL" --> Counter[Counter / Token Bucket]
        Counter -- "3. Allowed / Rejected" --> Gateway
    end

    Gateway -- "4. Forward (Success)" --> Service[Backend Service]
    Gateway -- "5. 429 Too Many Requests" --> Client

    style Gateway fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Redis fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Redis Latency**: Checking a rate limit in a local Redis cluster adds **1ms - 2ms**. Global Redis (cross-region) adds **50ms - 150ms**.
- **Token Bucket Size**: A common default is `Burst = 2 * Rate`. For 100 req/sec, allow a burst of **200**.
- **Storage Overhead**: 1 million active users * 64 bytes per Redis key = **~64 MB** of RAM. Rate limiting is very memory-efficient.
- **Retry-After**: For 429 errors, a `Retry-After` header of **1 - 5 seconds** is a safe starting point for most APIs.

## Real-World Case Studies

- **GitHub (API Rate Limits)**: GitHub uses a sophisticated rate-limiting system where unauthenticated requests are limited by IP (**60/hr**), while authenticated requests are limited by user/app (**5,000/hr**). They return detailed `X-RateLimit-*` headers to help developers manage their quotas.
- **Stripe (Layered Throttling)**: Stripe uses multiple layers: 1) **Request Rate Limiter** (prevents floods), 2) **Concurrent Request Limiter** (prevents long-running requests from tying up threads), and 3) **Fleet-wide Load Shedder** (drops low-priority traffic when the entire system is healthy but overloaded).
- **Google (Quotas & Throttling)**: Google Cloud APIs use complex "quotas" that are often enforced at the global level. They famously use a "Leaky Bucket" variant to smooth out traffic spikes, ensuring that their underlying infrastructure isn't hit by sudden "thundering herds" of requests.

## Connections

- [[01-Phase-1-Foundations__Module-02-API-Design__API_Gateway_Patterns]] — Rate limiting is one of the core responsibilities of an API gateway
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Circuit_Breakers_and_Bulkheads]] — Rate limiting prevents overload from consumers; circuit breakers prevent overload from dependencies. Complementary patterns.
- [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Multi-Tenancy_and_Isolation]] — Per-tenant rate limiting is a core isolation mechanism in multi-tenant systems
- [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]] — Rate limiting interacts with load balancing — limited requests still consume LB capacity
- [[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]] — Rate-limited clients retry; idempotency makes those retries safe

## Reflection Prompts

1. You're building a rate limiter for a public API that serves both free-tier users (100 req/min) and enterprise users (50,000 req/min). Your service runs on 30 instances. What's your architecture, and how do you handle the 500× difference in limits between tiers without over-engineering the free tier or under-serving the enterprise tier?

2. Your rate limiter uses Redis. During a Redis failover (30 seconds of downtime), your team decides to fail open. A burst of traffic during the failover overwhelms a downstream database. How do you prevent this in the future without failing closed (which would reject legitimate traffic)?

## Canonical Sources

- Stripe Engineering Blog, "Rate Limiters and Load Shedders" — practical breakdown of how Stripe layers multiple rate limiting strategies
- Cloudflare Blog, "How We Built Rate Limiting" — scale-oriented perspective on distributed rate limiting
- *System Design Interview* by Alex Xu — Chapter 4: "Design a Rate Limiter" — clear walkthrough of algorithms and distributed architecture
- IETF draft-ietf-httpapi-ratelimit-headers — the emerging standard for rate limit response headers