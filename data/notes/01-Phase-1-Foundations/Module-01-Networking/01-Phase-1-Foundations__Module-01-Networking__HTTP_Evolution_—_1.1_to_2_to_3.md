# HTTP Evolution — 1.1 to 2 to 3

## Why This Exists

HTTP is the application protocol that powers the web and most API communication. But the HTTP of 2025 looks nothing like the HTTP of 1997. The evolution from HTTP/1.1 → HTTP/2 → HTTP/3 is a thirty-year story of one recurring villain: **head-of-line blocking**. Each version solves it at a different layer, and each solution reveals new constraints that the next version must address.

Understanding this evolution isn't just protocol trivia — it directly affects how you design APIs, configure load balancers, choose between gRPC and REST, and architect CDN strategies.

## Mental Model

Imagine ordering food at a restaurant:

**HTTP/1.1**: One waiter, one table. You order an appetizer. You *cannot* order your main course until the appetizer arrives. If the kitchen is slow on one dish, everything behind it waits. To work around this, you open six tables (six TCP connections) and order at each separately.

**HTTP/2**: Same one waiter, but now they take all your orders at once (multiplexing). Appetizer, main, dessert — all in parallel over one connection. But there's a catch: the waiter walks a single narrow hallway (one TCP connection). If someone drops a tray in the hallway (a TCP packet loss), *everyone's* food is stuck until it's cleaned up.

**HTTP/3 (QUIC)**: Multiple independent hallways (QUIC streams over UDP). A spill in one hallway only blocks the food in that hallway. Everyone else's orders keep flowing.

## How It Works

### HTTP/1.1 — The Workhorse (1997)

HTTP/1.1 is a text-based, request-response protocol. One request, one response, then the next. Pipelining was specified (send multiple requests without waiting) but was so poorly implemented by proxies and servers that browsers disabled it.

**The head-of-line blocking problem**: With one connection, request B can't start until response A completes. If response A is a 5MB image, the 200-byte API response behind it waits.

**The workaround**: Browsers open **6 parallel TCP connections** per domain. Each connection handles one request at a time, so you get 6 concurrent requests. Developers exploited this with "domain sharding" — serving assets from `img1.example.com`, `img2.example.com`, etc. to trick the browser into opening more connections.

**The cost**: Each TCP connection requires a handshake (1 RTT) + TLS handshake (1–2 RTT) + slow start. Six connections means six times the setup overhead, six separate congestion windows, and six times the server-side memory for connection state.

### HTTP/2 — Multiplexing (2015)

HTTP/2 solves HTTP-layer head-of-line blocking with **stream multiplexing** over a single TCP connection.

**Key improvements**:
- **Binary framing**: Requests and responses are split into binary frames tagged with a stream ID. Frames from different streams interleave freely on one connection.
- **Multiplexing**: Multiple concurrent request-response pairs over one connection. No more 6-connection workaround.
- **Header compression (HPACK)**: HTTP headers are highly redundant across requests (same cookies, same user-agent, same host). HPACK compresses them using a shared dictionary, reducing header overhead by 85–90%.
- **Server push**: The server can proactively send resources it predicts the client will need (e.g., pushing CSS when HTML is requested). In practice, server push was hard to get right and was [removed from Chrome in 2022](about:blank). It's effectively dead.
- **Stream prioritization**: Clients can indicate which streams are more important. In practice, implementations varied wildly and prioritization was unreliable. HTTP/3 replaces this with a simpler priority model.

**The new head-of-line blocking**: HTTP/2 multiplexes at the *HTTP layer*, but all streams share one TCP connection. TCP delivers bytes in order. A single lost TCP packet blocks *all* HTTP/2 streams — even those whose data was fully received — until the lost packet is retransmitted. Under packet loss, HTTP/2 over one connection can perform **worse** than HTTP/1.1 over six connections, because HTTP/1.1's independent connections provide natural isolation.

This is TCP's fundamental limitation: it provides ordered byte-stream delivery, and you can't opt out of ordering for some bytes but not others.

### The HTTP/2 Regression Under Packet Loss

The head-of-line blocking problem described above produces a measurable regression in real-world conditions. HTTP/2 uses one TCP connection with up to 100 concurrent streams by default. HTTP/1.1 uses 6 parallel connections. At 1% per-packet loss, a lost TCP packet on HTTP/2's single connection stalls all 100 streams until retransmission completes (typically one RTT for fast retransmit). On HTTP/1.1's 6 connections, the same 1% loss rate stalls only the streams on the one affected connection — the other 5 continue. For a page loading 50 assets, HTTP/2 with 1% packet loss can have worse completion time than HTTP/1.1 with domain sharding.

This regression is environment-dependent. On wired connections in data centers, packet loss is effectively 0% — HTTP/2's reduced connection overhead and header compression are pure wins. On mobile 4G/5G networks, 1–3% packet loss is common during handoffs, congestion, and weak signal. Google's internal data from developing QUIC showed that at 2% packet loss, QUIC reduced page load time by 30% compared to HTTP/2 over TCP; at 25% (a very lossy link), the improvement exceeded 100%.

The practical implication: the decision to invest in HTTP/3 infrastructure should be driven by your users' actual packet loss distribution, not by protocol version numbers. For a SaaS product where 90% of users are on wired broadband, HTTP/2 is sufficient. For a consumer mobile app where 30% of sessions are on cellular, HTTP/3 is worth the QUIC operational complexity. Most teams reach a middle path: configure Cloudflare or Fastly to terminate HTTP/3 at the edge and use HTTP/2 between the CDN and the origin — mobile users get QUIC's benefits without requiring the origin servers to support QUIC.

### HTTP/3 — QUIC (2022)

HTTP/3 replaces TCP with **QUIC**, a transport protocol built on UDP that provides per-stream reliability.

**How QUIC solves head-of-line blocking**: Each QUIC stream has its own ordering and retransmission. A lost packet for stream A only blocks stream A. Streams B, C, and D continue unaffected. This is the same multiplexing model as HTTP/2, but without TCP's cross-stream coupling.

**Other QUIC advantages**:
- **0-RTT connection establishment**: QUIC integrates TLS 1.3 into its handshake. First connection: 1 RTT (vs TCP's 1 RTT + TLS's 1 RTT = 2 RTT). Repeat connection: 0 RTT — the client sends data in its very first packet using cached keys.
- **Connection migration**: QUIC connections are identified by a connection ID, not the (source IP, source port, dest IP, dest port) 4-tuple. When a mobile user switches from WiFi to cellular, their IP changes but the QUIC connection survives. TCP connections die on IP change.
- **Userspace implementation**: QUIC runs in userspace (not the kernel), so it can iterate faster than TCP. New congestion control algorithms don't require kernel patches.

**QUIC's challenges**:
- **UDP blocking**: Some corporate networks and firewalls block or rate-limit UDP. Browsers fall back to HTTP/2 over TCP when QUIC fails. As of 2025, QUIC accounts for roughly 30–40% of web traffic.
- **CPU overhead**: QUIC's per-packet encryption and userspace processing uses more CPU than kernel-optimized TCP. For data-center east-west traffic (low latency, low loss), the overhead isn't justified — TCP is fine.
- **Middlebox hostility**: NAT devices, firewalls, and load balancers are designed around TCP. QUIC's UDP-based approach requires new handling. Hardware load balancers (L4) may not understand QUIC connection IDs.
- **Ecosystem maturity**: TCP has decades of kernel optimization, hardware offload (TSO, GRO, checksum offload), and tooling. QUIC tooling and optimization are catching up but not at parity.

## Trade-Off Analysis

| Dimension | HTTP/1.1 | HTTP/2 | HTTP/3 (QUIC) |
|-----------|----------|--------|----------------|
| Connections per domain | 6 (browser default) | 1 (multiplexed) | 1 (multiplexed) |
| HOL blocking | HTTP layer | TCP layer | None (per-stream) |
| Handshake latency | 1 RTT (TCP) + 1–2 RTT (TLS) | Same as 1.1 | 1 RTT first, 0 RTT repeat |
| Header compression | None | HPACK | QPACK |
| Transport | TCP | TCP | QUIC (UDP) |
| Connection migration | No | No | Yes |
| Firewall friendliness | Excellent | Excellent | Moderate (UDP blocked on some networks) |
| Server CPU cost | Low | Low | Higher (userspace crypto) |
| Best for | Legacy compatibility, simple APIs | Most modern web traffic, APIs | Mobile-heavy, lossy networks, latency-sensitive |

## When to Use What (System Design Perspective)

**Internal service-to-service (data center)**: HTTP/2 or gRPC (which uses HTTP/2). Low latency, low loss, TCP is perfectly fine. The multiplexing and header compression benefits of HTTP/2 matter; QUIC's advantages don't.

**Client-facing APIs**: HTTP/2 as baseline, with HTTP/3 support for mobile clients. Mobile networks have higher packet loss and IP changes (WiFi→cellular), where QUIC's per-stream recovery and connection migration shine.

**CDN / edge**: HTTP/3 between client and CDN edge, HTTP/2 between edge and origin. CDN providers (Cloudflare, Fastly, Akamai) have led HTTP/3 adoption because their edge traffic is exactly the use case QUIC was designed for.

## Failure Modes

**HTTP/2 head-of-line blocking at TCP level**: HTTP/2 multiplexes many streams over one TCP connection. If a single TCP packet is lost, all streams on that connection stall until the packet is retransmitted — even streams whose data wasn't in the lost packet. Under lossy networks (mobile, Wi-Fi), HTTP/2 can be slower than HTTP/1.1 with multiple connections. Solution: HTTP/3 (QUIC) eliminates this by using independent streams at the transport layer.

**HTTP/2 single-connection saturation**: All requests to a host share one TCP connection. If that connection's bandwidth is saturated or the server's HTTP/2 stream limit is reached, new requests are queued even though the server has capacity. Solution: allow 2-3 connections per host for high-throughput scenarios, tune `MAX_CONCURRENT_STREAMS` on the server.

**HPACK compression state desync**: HTTP/2 compresses headers using a stateful encoder (HPACK). If a proxy or middlebox drops or reorders frames, the compression state between client and server diverges, and every subsequent request produces garbled headers. The connection must be torn down. Solution: ensure all intermediaries fully support HTTP/2, or terminate HTTP/2 at the edge and use HTTP/1.1 to backends.

**HTTP/3 UDP blocking**: Some corporate firewalls and ISPs block UDP traffic entirely, preventing QUIC/HTTP/3 connections. The browser falls back to HTTP/2 over TCP, but the fallback detection adds latency to the first request. Solution: Alt-Svc header-based upgrade (try QUIC, fall back to TCP), and ensure TCP-based HTTP/2 is always available as a baseline.

**Server push abuse**: HTTP/2 server push proactively sends resources before the client requests them. Overly aggressive push wastes bandwidth (client already has resources cached) or causes contention with client-initiated requests. Solution: most implementations have disabled server push — Chrome removed support in 2022. Use `103 Early Hints` instead.

## Architecture Diagram

```mermaid
graph TD
    subgraph "HTTP/1.1 (Sequential)"
        C1[Client] -- "Req 1" --> S1[Server]
        S1 -- "Res 1" --> C1
        C1 -- "Req 2 (Wait for 1)" --> S1
        S1 -- "Res 2" --> C1
    end

    subgraph "HTTP/2 (TCP Multiplexing)"
        C2[Client] -- "Stream 1 (Req 1)" --> S2[Server]
        C2 -- "Stream 3 (Req 2)" --> S2
        S2 -- "Stream 3 (Res 2)" --> C2
        S2 -- "Stream 1 (Res 1)" --> C2
    end

    subgraph "HTTP/3 (QUIC Multiplexing)"
        C3[Client] -- "Stream 1" --> S3[Server]
        C3 -- "Stream 2" --> S3
    end

    style S2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style S3 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **TCP Setup Latency**: 1.5 RTTs for TCP + 1-2 RTTs for TLS 1.2 = **~3 RTTs** before data.
- **QUIC Setup Latency**: 1 RTT (TLS 1.3 integrated) for new connections, **0 RTT** for resumed connections.
- **Header Savings**: HTTP/2 (HPACK) can reduce header size from **~500-800 bytes** to **~20-50 bytes** per request.
- **Parallelism**: Browsers limit HTTP/1.1 to **6 connections** per domain. HTTP/2 and HTTP/3 have no such limit (standard is **100 concurrent streams**).

## Real-World Case Studies

- **Google (QUIC/HTTP/3 Origins)**: Google developed QUIC originally to improve search and YouTube performance on Chrome. They found that 0-RTT handshakes and improved congestion control reduced YouTube's "rebuffer" rate by **15-18%** on lossy networks.
- **Cloudflare (HTTP/3 Adoption)**: Cloudflare was an early adopter of HTTP/3 at the edge. They observed that for heavy pages with many small assets (JS, CSS, images), HTTP/3 provides a **10-15% improvement** in "Time to Interactive" for users on mobile networks compared to HTTP/2.

## Connections

- [[01-Phase-1-Foundations__Module-01-Networking__TCP_Deep_Dive]] — HTTP/1.1 and HTTP/2 run over TCP; understanding TCP's congestion control and HOL blocking explains why HTTP/3 needed to move to UDP
- [[01-Phase-1-Foundations__Module-01-Networking__TCP_vs_UDP]] — HTTP/3/QUIC is the canonical example of building reliability on UDP
- [[01-Phase-1-Foundations__Module-01-Networking__Connection_Pooling_and_Keep-Alive]] — HTTP/2 multiplexing reduces the need for connection pools, but they still matter for HTTP/1.1 backends
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_vs_REST_vs_GraphQL]] — gRPC runs on HTTP/2 by design; understanding multiplexing explains why gRPC performs well for streaming
- [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]] — L7 load balancers terminate HTTP and can inspect application data; protocol version affects load balancer behavior
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__CDN_Architecture]] — CDNs are the largest deployers of HTTP/3

## Reflection Prompts

1. You're running an API behind an L7 load balancer that terminates HTTP/2 from clients but uses HTTP/1.1 to backend services. A performance engineer proposes switching the backend leg to HTTP/2 as well. What are the expected benefits and what might go wrong?

2. Your mobile app makes 15 concurrent API calls on page load. Users on cellular networks report slow, inconsistent load times. You're currently using HTTP/2. Would switching to HTTP/3 help, and why specifically?

## Canonical Sources

- Belshe, Peon, Thomson, "Hypertext Transfer Protocol Version 2 (HTTP/2)" — RFC 7540
- Iyengar & Thomson, "QUIC: A UDP-Based Multiplexed and Secure Transport" — RFC 9000
- Cloudflare Blog, "HTTP/3: the past, the present, and the future" — practical deployment perspective
- *High Performance Browser Networking* by Ilya Grigorik (free online at hpbn.co) — Chapters on HTTP/2 and transport-layer optimization; this is the best accessible reference for understanding HTTP performance