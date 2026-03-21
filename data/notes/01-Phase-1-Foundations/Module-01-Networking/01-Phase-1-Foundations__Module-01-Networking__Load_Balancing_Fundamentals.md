# Load Balancing Fundamentals

## Why This Exists

A single server has a ceiling — CPU, memory, network bandwidth, file descriptors. To serve more traffic, you add more servers. But now you have a new problem: how does traffic get distributed across them? Without load balancing, some servers are overloaded while others sit idle. Worse, if a server dies, its traffic gets black-holed.

Load balancing solves three problems simultaneously: **distribution** (spread traffic evenly), **availability** (route around failures), and **scalability** (add/remove servers without client changes). It's so fundamental that every non-trivial production system has at least one load balancer — and most have several, at different layers.

## Mental Model

A load balancer is a traffic cop at an intersection. Cars (requests) arrive, and the cop directs them to the least congested road (server). If a road is closed (server is down), the cop stops sending cars that way.

The difference between L4 and L7 load balancing is how much the traffic cop looks at each car. An L4 cop glances at the license plate (source/destination IP and port) and makes a routing decision. An L7 cop opens the door, reads the passenger's itinerary (HTTP headers, URL path, cookies), and routes based on the destination written inside.

## How It Works

### L4 vs L7: The Core Distinction

**L4 (Transport Layer) load balancing** operates on TCP/UDP connections. It sees source IP, destination IP, source port, destination port, and protocol. It routes entire *connections*, not individual requests. Once a connection is assigned to a backend, all packets on that connection go to the same backend.

- **Pros**: Extremely fast (hardware-offloadable, kernel-level), low latency, protocol-agnostic (works for HTTP, gRPC, database traffic, anything over TCP/UDP).
- **Cons**: Can't make routing decisions based on request content (URL path, headers, cookies). Can't do content-based health checks. Can't modify requests/responses.
- **Examples**: AWS NLB, HAProxy in TCP mode, IPVS, Maglev (Google's software L4 LB).

**L7 (Application Layer) load balancing** terminates the client connection, inspects the HTTP request (or other application protocol), makes a routing decision, then opens a *new* connection to the chosen backend.

- **Pros**: Content-based routing (route `/api/v1/*` to service A, `/api/v2/*` to service B). Header inspection (route by cookie, auth token, A/B test group). Request/response modification (add headers, strip paths, rate limit). Sophisticated health checks (check that `/health` returns 200, not just that a TCP port is open). Connection multiplexing (one client connection, multiple backend connections).
- **Cons**: Higher latency (must parse application protocol), higher CPU cost, must understand the protocol (HTTP, gRPC, WebSocket).
- **Examples**: AWS ALB, Nginx, Envoy, HAProxy in HTTP mode, Cloudflare Load Balancing.

**In practice, you often use both.** An L4 load balancer at the network edge (for raw TCP throughput and DDoS absorption) fronts a fleet of L7 load balancers (for content-based routing and TLS termination). Google's architecture: Maglev (L4) → GFE (L7).

### Load Balancing Algorithms

| Algorithm | How It Works | Best For | Watch Out For |
|-----------|-------------|----------|---------------|
| **Round-robin** | Rotate through backends sequentially | Homogeneous servers, uniform request cost | Ignores server load; slow server gets same traffic as fast one |
| **Weighted round-robin** | Like round-robin, but servers with higher weight get more traffic | Heterogeneous hardware (8-core vs 16-core machines) | Weights must be manually tuned or automated |
| **Least connections** | Route to the server with fewest active connections | Requests with varying processing time | Newly added servers get flooded (0 connections → all new traffic) |
| **Least response time** | Route to the server with the lowest recent latency | Latency-sensitive services | Requires latency tracking; can oscillate under load |
| **Random** | Pick a random server | Surprisingly effective at scale; avoids herd behavior | Slight imbalance with small server counts |
| **Random-two-choice** | Pick two random servers, send to the one with fewer connections | Best of both random and least-connections; used by Nginx | Slightly more overhead than pure random |
| **IP hash** | Hash the client IP to pick a server | Simple session affinity (same client → same server) | Uneven distribution if traffic sources are skewed; doesn't handle server count changes gracefully |
| **Consistent hashing** | Hash clients onto a ring with virtual nodes | Caching layers (minimize cache invalidation on server changes) | More complex; see [[Consistent Hashing]] for full treatment |

**The underrated algorithm**: Random-two-choice (also called "power of two choices") deserves special attention. It was proven by Mitzenmacher (1996) that choosing between just two random options is exponentially better than choosing one random option. Nginx uses this. It avoids the thundering-herd problem of least-connections (where all new traffic floods a newly added server) while providing nearly optimal distribution.

### Health Checks

Load balancers must detect when a backend is unhealthy and stop sending it traffic.

**Passive health checks**: The load balancer monitors responses from normal traffic. If a backend returns too many errors or times out repeatedly, it's marked unhealthy. No extra probe traffic, but detection is slower.

**Active health checks**: The load balancer sends periodic probe requests (`GET /health`) to each backend. If a backend fails N consecutive checks, it's removed from the pool. Faster detection, but adds probe traffic. The health check endpoint should verify meaningful health — not just "process is running" but "I can reach my database and my dependencies are responding."

**The health check death spiral**: A backend is slow (not dead) due to GC pressure or a slow dependency. The health check passes (it responds, just slowly). The load balancer keeps sending traffic. The traffic makes the slowness worse. Eventually it times out, gets marked unhealthy, and its traffic shifts to other backends — which may then become overloaded, cascading the failure. Mitigation: health checks that include latency thresholds, not just success/failure. Also: [[Circuit Breakers and Bulkheads]].

### Connection Draining (Graceful Shutdown)

When a backend needs to be removed (deploy, scale-down, failure), you don't want to kill in-flight requests. Connection draining tells the load balancer to stop sending *new* requests to the backend, but allow existing connections to complete within a timeout.

Without draining, every deploy causes a burst of 5xx errors for requests that were mid-flight when the backend was killed. This is especially important for long-lived connections (WebSockets, gRPC streams, large file downloads).

## Trade-Off Analysis: Where to Terminate TLS

TLS termination can happen at the load balancer or at the backend. Both have trade-offs:

| Approach | Pros | Cons |
|----------|------|------|
| **TLS at LB** (most common) | Centralizes certificate management; backends see plaintext (simpler); LB can inspect/modify HTTP | Traffic between LB and backend is unencrypted (fine in a trusted VPC, not fine over the internet) |
| **TLS passthrough** (L4 LB) | End-to-end encryption; LB never sees plaintext | LB can't inspect HTTP (no L7 routing, no content-based decisions); certificate management distributed to every backend |
| **TLS re-encryption** | End-to-end encryption + L7 features at LB | Double the crypto overhead (decrypt at LB, re-encrypt to backend); certificate management in two places |

Most production setups use TLS termination at the L7 load balancer, with mTLS between the LB and backends within a trusted network boundary. See [[TLS and Certificate Management]].

## Failure Modes

- **Uneven distribution with persistent connections**: HTTP/2 or gRPC clients maintain long-lived connections. If a new backend is added, existing connections stay pinned to old backends. The new backend gets no traffic until clients reconnect. Mitigation: periodic connection recycling (max connection lifetime), or L7 LB that distributes *requests* not *connections*.

- **Health check false positives**: An overly aggressive health check removes a backend that's temporarily slow but functional. Traffic shifts, overloading remaining backends, causing them to slow down and fail health checks too — cascading failure. Mitigation: require multiple consecutive failures before marking unhealthy, and ramp traffic back in slowly when a backend recovers.

- **Single-LB SPOF**: The load balancer itself is a single point of failure. Mitigation: redundant LBs in active-passive (VRRP) or active-active (anycast) configuration. Cloud-managed LBs (ALB, NLB) handle this for you.

- **Sticky sessions gone wrong**: You configured IP-hash or cookie-based session affinity for a stateful app. One backend gets disproportionate traffic because a corporate NAT makes thousands of users appear as one IP. Mitigation: migrate session state to an external store (Redis), eliminate the need for stickiness, or use finer-grained affinity (cookie per user, not per IP).

## Architecture Diagram

```mermaid
graph TD
    Client[Global Traffic] --> DNS[Route 53 GeoDNS]
    DNS --> LB_L4[Network Load Balancer - L4 Anycast]
    
    subgraph "Regional Edge"
        LB_L4 --> LB_L7_1[Application LB - L7]
        LB_L4 --> LB_L7_2[Application LB - L7]
    end
    
    subgraph "Service Fleet"
        LB_L7_1 --> S1[App Instance A]
        LB_L7_1 --> S2[App Instance B]
        LB_L7_2 --> S3[App Instance C]
    end
    
    S1 -- "Health Check: /health" --> LB_L7_1
    S2 -- "Health Check: /health" --> LB_L7_1

    style LB_L4 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style LB_L7_1 fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **L4 Latency**: Adding an L4 LB (NLB) typically adds **< 1ms** of latency.
- **L7 Latency**: An L7 LB (ALB/Nginx) adds **5ms - 15ms** due to TLS termination and header parsing.
- **Health Check Traffic**: Probing 100 instances every 10s from 3 LB nodes = **30 requests/sec** overhead. Small but non-zero.
- **Max Connections**: A single Nginx/Envoy instance can handle **50k - 100k** concurrent active connections (depending on memory/FD limits).
- **Draining Timeout**: Set connection draining to **30s - 60s** for standard web traffic, but **up to 1 hour** for long-lived WebSockets.

## Real-World Case Studies

- **Google (Maglev)**: Google's Maglev is a massive software L4 load balancer that runs on standard commodity servers. It uses a specialized form of consistent hashing to ensure that even if a Maglev node fails, existing connections are not reset, achieving "connection longevity" at incredible scale.
- **GitHub (HAProxy)**: GitHub uses HAProxy extensively for its L7 routing. They famously wrote about their migration to "GLB" (GitHub Load Balancer), which combines Anycast, a custom L4 layer, and HAProxy to handle billions of git and web requests with high availability.
- **Netflix (Zuul/Envoy)**: Netflix originally built Zuul as their edge gateway (L7). They've since transitioned much of their internal mesh traffic to Envoy, using it as a "sidecar" load balancer to handle service-to-service communication, retries, and circuit breaking.

## Connections

- [[DNS Resolution Chain]] — DNS-based load balancing (multiple A records) is the coarsest level; it lacks health checks and has TTL-based update delays
- [[Anycast and GeoDNS]] — Global-scale "load balancing" at the DNS/network layer
- [[TCP Deep Dive]] — L4 LBs operate at the TCP level; understanding connections and congestion windows explains LB behavior
- [[HTTP Evolution — 1.1 to 2 to 3]] — HTTP/2 multiplexing changes the relationship between connections and requests, affecting LB distribution
- [[Connection Pooling and Keep-Alive]] — Long-lived pooled connections interact with LB distribution algorithms
- [[Consistent Hashing]] — The algorithm behind cache-aware load balancing and minimal redistribution on topology changes
- [[API Gateway Patterns]] — API gateways are L7 load balancers with additional capabilities (auth, rate limiting, transformation)

## Reflection Prompts

1. You're running a gRPC service behind an AWS ALB. You notice that when you add a new instance to the target group, it takes 10+ minutes before it receives its fair share of traffic, even though health checks pass within seconds. What's causing this, and how do you fix it?

2. An engineer proposes using client-side load balancing (no centralized LB — each client discovers backends and picks one) for a latency-critical internal service. What are the advantages over a centralized LB, and what new problems does it introduce?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 6 discusses partitioning and routing, which connects to how LBs distribute requests
- Eisenbud et al., "Maglev: A Fast and Reliable Software Network Load Balancer" (NSDI 2016) — Google's software L4 LB paper, a good window into high-scale LB design
- Mitzenmacher, "The Power of Two Choices in Randomized Load Balancing" (1996) — the foundational paper behind random-two-choice
- Envoy proxy documentation — excellent reference for L7 load balancing concepts, health checking, and circuit breaking in a modern service mesh