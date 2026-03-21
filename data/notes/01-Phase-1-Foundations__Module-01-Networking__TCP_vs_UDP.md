# TCP vs UDP

## Why This Exists

TCP gives you reliable, ordered delivery. UDP gives you... nothing. Just raw datagrams, sent and forgotten. That sounds like TCP always wins — but the guarantees TCP provides have costs (latency, head-of-line blocking, connection overhead), and for some workloads those costs are worse than the problems they solve. The real question isn't "which is better?" but "where should reliability live — in the transport layer or in the application?"

## Mental Model

TCP is like certified mail: guaranteed delivery, delivery confirmation, delivered in order. Expensive, slow.

UDP is like postcards: cheap, fast, no guarantee they arrive, no guarantee of order. If you care about reliability, you add tracking yourself.

The key insight: UDP isn't "unreliable TCP." It's a *minimal foundation* that lets you build exactly the reliability guarantees you need — no more, no less. QUIC (the protocol beneath HTTP/3) is literally "a better TCP built on top of UDP."

## When UDP Wins

**Real-time media (voice, video, gaming)**: A dropped video frame is invisible — the next frame replaces it. But a *delayed* frame (waiting for TCP retransmission) causes visible stuttering. For real-time streams, "skip the lost packet and move on" is strictly better than "stall everything to retransmit." This is why RTP (Real-time Transport Protocol) runs over UDP.

**DNS**: Queries are small (fits in one packet), stateless, and idempotent. The overhead of a TCP handshake per query would triple DNS latency. (DNS does fall back to TCP for responses over 512 bytes or when DNSSEC signatures are large.)

**QUIC / HTTP/3**: QUIC is a userspace transport protocol built on UDP that provides TCP-like reliability *per stream* without cross-stream head-of-line blocking. It also integrates TLS 1.3 into its handshake, achieving 0-RTT connection establishment for repeat clients. By building on UDP, QUIC avoids TCP's kernel-level ossification — it can iterate faster because it runs in userspace. See [[HTTP Evolution — 1.1 to 2 to 3]].

**Service discovery and health checks**: Some internal service meshes use UDP for lightweight heartbeats where an occasional missed beat is tolerable. Consul's Serf protocol uses UDP gossip for membership detection.

**Metrics and telemetry**: StatsD sends metrics over UDP by default. If a metrics packet drops, you lose one data point out of thousands per second — an acceptable trade-off for avoiding TCP connection overhead from every application server to the metrics collector.

## When TCP Wins

**Anything requiring correctness**: Database queries, API calls, file transfers, financial transactions. If dropping or reordering data would cause incorrect behavior, TCP's guarantees are not optional.

**When you don't want to build your own reliability**: Implementing congestion control, retransmission, and ordering in the application layer is hard. QUIC took Google years to develop. If you don't have a specific reason to need UDP's flexibility, TCP gives you battle-tested reliability for free.

**Firewall-friendliness**: Many corporate firewalls and middleboxes are configured to pass TCP and block UDP. This is a pragmatic constraint that can override technical preferences. (QUIC faces this — some networks block it, and browsers fall back to TCP.)

## Trade-Off Analysis

| Dimension | TCP | UDP |
|-----------|-----|-----|
| Connection setup | 1 RTT handshake (+ TLS) | None — send immediately |
| Delivery guarantee | Reliable, ordered | Best-effort, unordered |
| Head-of-line blocking | Yes — one lost packet blocks the stream | No — each datagram is independent |
| Congestion control | Built-in (CUBIC, BBR) | None — application must implement or accept consequences |
| Overhead per packet | 20-byte header + state tracking | 8-byte header, stateless |
| NAT traversal | Easier (connection state in middleboxes) | Harder (no connection state; requires hole-punching or STUN/TURN) |

## Failure Modes

- **UDP flood / amplification attacks**: Because UDP is connectionless, an attacker can spoof the source IP and trigger large responses (DNS amplification, NTP amplification). The response goes to the victim, not the attacker. This is the most common DDoS vector. Mitigation: BCP38 source address validation, rate limiting, response rate limiting (DNS RRL).
- **UDP and NAT**: NAT devices track TCP connections by the handshake. UDP has no connection, so NAT entries for UDP are timer-based and expire quickly. Long-lived UDP "connections" (like WebRTC) need periodic keepalive packets to keep the NAT mapping alive.
- **Building reliability wrong**: Teams that build their own UDP-based protocol often get congestion control wrong — either omitting it entirely (creating an aggressive flow that starves TCP traffic) or implementing it poorly (worse than TCP's well-tested algorithms). Unless you have a specific, well-understood reason to control reliability yourself, TCP is the safer choice.

## Architecture Diagram

```mermaid
graph TD
    subgraph "TCP: Reliable Byte Stream"
        C1[Client] -- "1. SYN" --> S1[Server]
        S1 -- "2. SYN-ACK" --> C1
        C1 -- "3. ACK + Data" --> S1
        Note over C1, S1: 1 RTT Handshake before data
        S1 -- "4. ACK for Data" --> C1
    end

    subgraph "UDP: Unreliable Datagram"
        C2[Client] -- "1. Data (Postcard)" --> S2[Server]
        C2 -- "2. Data (Postcard)" --> S2
        Note over C2, S2: 0 RTT. Just send it.
        S2 --x C2: No ACK back
    end

    style S1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style S2 fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **Header Size**: TCP is **20 bytes** minimum. UDP is only **8 bytes**.
- **Handshake Latency**: TCP is **1 RTT** (minimum). UDP is **0 RTT**.
- **Statelessness**: A single UDP server can handle **millions of PPS** (packets per second) because it doesn't need to store connection state (TCB) for each client.
- **Retransmission Penalty**: In TCP, a single lost packet can double the latency for an entire block of data. In UDP, the application decides (often just ignoring the loss).

## Real-World Case Studies

- **Discord (Voice over UDP)**: Discord uses UDP for all voice and video traffic via the WebRTC standard. They found that TCP's head-of-line blocking made voice chat unusable on slightly unstable WiFi, as a single lost packet would cause the audio to "stall" for hundreds of milliseconds while TCP retransmitted.
- **StatsD (Metrics over UDP)**: Etsy's StatsD popularized sending application metrics over UDP. The reasoning was simple: your monitoring system should never take down your application. If the StatsD server is slow or down, the app just "fires and forgets" UDP packets into the void, incurring zero performance penalty.
- **QUIC (Google/Meta/Cloudflare)**: Almost all traffic to Google and Meta services now runs over QUIC (HTTP/3), which is a custom reliability layer built on top of UDP. This allows them to avoid TCP's "handshake tax" and improve performance on mobile networks.

## Connections

- [[TCP Deep Dive]] — The full mechanics of what TCP provides (and what it costs)
- [[HTTP Evolution — 1.1 to 2 to 3]] — HTTP/3 and QUIC: the highest-profile example of "build better TCP on UDP"
- [[DNS Resolution Chain]] — DNS primarily uses UDP, with TCP fallback
- [[Load Balancing Fundamentals]] — L4 balancers handle TCP and UDP differently; UDP load balancing is stateless but can't do connection-aware routing

## Reflection Prompts

1. You're designing a real-time multiplayer game where players see each other's positions. Position updates arrive 60 times per second. A retransmitted position from 200ms ago is worse than no data at all. Would you use TCP or UDP, and what would you layer on top of UDP to handle the cases where you *do* need reliability (e.g., chat messages, game state checkpoints)?

2. A video conferencing application uses UDP for media streams but TCP for signaling. During a network congestion event, the TCP signaling connection stalls (head-of-line blocking), making it impossible to mute/unmute or add participants — even though the video/audio keeps flowing over UDP. How would you redesign the signaling path to avoid this, and what trade-offs does your solution introduce?

3. QUIC was designed to get the best of both TCP and UDP — reliable, multiplexed, encrypted, but over UDP to avoid TCP's head-of-line blocking. Some corporate networks block all UDP traffic. If you were building a latency-sensitive API that needs to work everywhere, how would you design the transport negotiation strategy?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 8 discusses unreliable networks and the guarantees TCP provides
- Langley et al., "The QUIC Transport Protocol: Design and Internet-Scale Deployment" (SIGCOMM 2017) — Google's paper on building reliable transport over UDP