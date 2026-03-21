# Real-Time Collaboration

## Why This Exists

Traditional web applications follow request-response: the client asks, the server answers. Real-time features invert this: the server pushes data to clients as it changes. Live cursors, collaborative editing, chat, notifications, multiplayer games, and presence indicators ("who's online") all require persistent connections and server-initiated messaging. This introduces new scaling challenges: maintaining millions of concurrent connections, routing messages to the right connections, and keeping collaborative state consistent across participants.


## Mental Model

Two people editing the same whiteboard from different rooms, via video cameras. Each person sees their own whiteboard and a delayed feed of the other person's whiteboard. When both write in the same spot simultaneously, you need a rule to merge their contributions without losing either one. CRDTs are like using a whiteboard where the ink is mathematically designed to merge without conflicts — two people can both add sticky notes, and the result is always the union of both sets. OT (Operational Transform) is like having a referee who watches both video feeds, transforms each person's edits to account for the other's simultaneous changes, and applies them in a consistent order. WebSockets are the video feed — the real-time channel that keeps both rooms synchronized.

## Transport Mechanisms

### WebSocket

A full-duplex, persistent TCP connection between client and server. Both sides can send messages at any time. The connection starts as an HTTP request (upgrade handshake), then transitions to the WebSocket protocol.

**Strengths**: Bidirectional, low latency (no per-message handshake overhead), widely supported by browsers and servers.

**Scaling challenges**: Each WebSocket connection consumes a file descriptor and memory on the server (~10–50KB per connection depending on buffer sizes). A single server can handle 100K–500K concurrent connections with careful tuning (epoll/kqueue, non-blocking I/O, minimal per-connection state). Beyond that, you need multiple servers — which introduces the routing problem.

**The routing problem**: User A is connected to Server 1. User B is connected to Server 2. A sends a message to a shared document room. How does Server 1 forward the message to Server 2 (where B is connected)? Solutions: a pub/sub backend (Redis pub/sub, Kafka) where servers subscribe to room channels. When Server 1 receives a message for a room, it publishes to Redis. Server 2 (subscribed to the same room) receives it and forwards to B.

**Connection lifecycle management**: Heartbeats (ping/pong frames every 30 seconds) detect dead connections. Reconnection with exponential backoff + jitter handles temporary disconnections. Message buffering (server-side, per connection) holds messages during brief disconnections and delivers on reconnect — this prevents message loss during WiFi-to-cellular switches.

### Server-Sent Events (SSE)

A unidirectional server→client stream over standard HTTP. The client opens a long-lived HTTP connection; the server sends events as they occur. Simpler than WebSocket (works through HTTP proxies and CDNs, no special protocol).

**Best for**: Live feeds (news, stock tickers), notification streams, dashboard updates — anywhere the client only receives, never sends (or sends infrequently via regular HTTP POST).

**Limitations**: Unidirectional (server→client only). HTTP/1.1 browsers limit to 6 concurrent SSE connections per domain. HTTP/2 multiplexing removes this limit.

### Comparison

| Dimension | WebSocket | SSE | Long Polling |
|-----------|-----------|-----|-------------|
| Direction | Bidirectional | Server→client | Simulated push |
| Protocol | WebSocket (ws://) | HTTP | HTTP |
| Connection | Persistent | Persistent | Repeated requests |
| Proxy/CDN compatibility | Moderate (some proxies interfere) | Excellent (standard HTTP) | Excellent |
| Latency | Lowest | Low | Medium (poll interval) |
| Browser support | Universal | Universal (except old IE) | Universal |
| Best for | Chat, collaboration, gaming | Feeds, notifications, dashboards | Fallback when WS blocked |

## CRDTs vs Operational Transform for Collaborative Editing

When multiple users edit the same document simultaneously, their edits can conflict. Two approaches exist to resolve this:

### Operational Transform (OT) — the Google Docs approach

Each editing operation (insert character at position 5, delete character at position 3) is sent to a central server. The server **transforms** concurrent operations against each other to preserve user intent.

**Example**: Alice inserts "X" at position 5. Bob deletes the character at position 3. If Bob's delete is applied first, positions shift — Alice's insert should now be at position 4, not 5. OT transforms Alice's operation: `insert(5) → insert(4)` given Bob's `delete(3)`.

**Key property**: OT requires a **central server** to sequence operations. All operations flow through the server, which determines the canonical order and transforms accordingly. This makes OT poorly suited for offline or peer-to-peer editing — without the server, operations can't be transformed.

**Complexity**: Every pair of operation types (insert×insert, insert×delete, delete×delete, plus formatting operations, cursor moves, etc.) needs a transform function. The number of transform functions grows quadratically with operation types. Google Docs has invested years in getting this right.

### CRDTs — the Figma approach

[[CRDTs|Conflict-free Replicated Data Types]] are data structures designed so that concurrent operations always merge correctly, without a central sequencer. Each client maintains a local replica. Edits are applied locally (instant feedback) and broadcast to other clients. Merging is deterministic — any order of message delivery produces the same final state.

**How it works for text editing**: Each character has a unique, immutable ID and a position defined relative to its neighbors (not absolute position). Inserting between characters A and B creates a new character with an ID that sorts between A and B. Deletions mark characters as tombstones rather than removing them. This means positions never shift — concurrent inserts at the same position both succeed and interleave deterministically.

**Figma's implementation**: Figma uses CRDTs for their multiplayer design tool. Each design element (rectangle, text block, path) is a CRDT object. Properties (position, color, size) are LWW-Registers (last-writer-wins per property). Adding/removing elements uses OR-Set semantics. The server acts as a relay and persistent store — not a sequencer.

### Decision Framework

| Dimension | OT | CRDT |
|-----------|-----|------|
| Central server needed? | Yes (operation sequencing) | No (peer-to-peer possible) |
| Offline editing | Poor (needs server to transform) | Excellent (merge on reconnect) |
| Edit latency | Server round-trip | Instant (local-first) |
| Implementation complexity | Transform functions per operation pair (quadratic) | CRDT data structure design |
| Metadata overhead | Low | Higher (per-character IDs, tombstones) |
| Proven at scale | Google Docs (2006+) | Figma (2019+), Automerge, Yjs |

**Recommendation**: For new collaborative editing systems, CRDTs are the clear choice. Use Yjs for text-heavy editors (best ecosystem of editor bindings — ProseMirror, CodeMirror, Monaco, Tiptap). Use Automerge for JSON-document collaboration where you want full version history. Consider Loro if you need tree-structured CRDTs. For the sync layer, Automerge Repo or PartyServer with y-partyserver can get you to production fast. OT is only appropriate if you're extending Google's existing infrastructure.

## Presence Systems

"Who's online?" "Who's viewing this document?" "Where is each user's cursor?"

**Implementation**: Each connected client sends periodic heartbeats (every 5–30 seconds) with metadata: user ID, document ID, cursor position, selection range. The presence service (Redis-backed) tracks last-heartbeat-time per user per document. Users whose heartbeat is older than 2× the interval are marked offline.

**Cursor position broadcasting**: Each user's cursor position is broadcast to all other users in the same document room at a throttled rate (10–30 updates/second per user). At 100 concurrent editors, that's 1,000–3,000 cursor update messages/second — manageable for a single WebSocket server.

**Scaling presence**: Partition by document. Each document's presence is tracked on the server handling that document's WebSocket connections. Cross-server presence (for "who's online globally") uses Redis pub/sub or a dedicated presence aggregation service.

## Real-Time Data Pipelines: CDC to Frontend

[[Write-Ahead Log|Change Data Capture]] can power real-time UI updates without polling:

```
Database change → CDC (Debezium) → Kafka → WebSocket Service → Client UI
```

**Example**: A dashboard showing live order status. When an order's status changes in the database, Debezium captures the change from the WAL, publishes to Kafka. A WebSocket service consumes the Kafka event, looks up which clients are viewing that order, and pushes the update via WebSocket. The client updates the UI in near-real-time — no polling, no wasted requests.

**Latency**: Database write → CDC capture (~100ms) → Kafka produce/consume (~50ms) → WebSocket push (~10ms) = ~200ms end-to-end. Fast enough for dashboards and notifications, not fast enough for collaborative editing (which needs <50ms).

## 2025–2026 Ecosystem Evolution

### CRDT Library Maturity

The CRDT ecosystem has matured significantly since Yjs and Automerge first proved the concept:

**Automerge 3.0** shipped columnar compression at runtime (matching on-disk format), achieving roughly 100× reduction in steady-state memory usage. Automerge Repo 2.0 (May 2025) packaged common patterns — storage adapters, sync servers, networking — into a reusable framework so developers no longer need to wire those pieces together manually. Automerge now positions itself as "PostgreSQL for local-first apps" with bindings in JavaScript/WASM, Rust, C, Python, Swift, and Java.

**Yjs** remains the most widely adopted CRDT library for text collaboration, with a rich provider ecosystem: y-websocket, y-webrtc, y-indexeddb for client persistence, y-redis, and y-mongodb for server storage. The Awareness CRDT (a lightweight protocol layered on top of Yjs) has become the standard mechanism for cursor and presence features. Commercial hosting options have emerged — Liveblocks (managed Yjs backend), Hocuspocus (Tiptap's sync server), and Y-Sweet — reducing the infrastructure burden that was Yjs's biggest adoption friction.

**Loro** is a newer CRDT library (Rust core, WASM bindings) implementing the Fugue algorithm, which reduces interleaving anomalies in concurrent text editing. It also supports Tree CRDTs for hierarchical data (file systems, outlines). Still maturing, but worth watching as a next-generation alternative.

**Managed platforms** like Liveblocks and Velt now provide full collaboration stacks — presence, cursors, comments, permissions, notifications — built on CRDT foundations (Yjs under the hood). These target teams who want real-time features without building infrastructure, offering integration in days rather than months.

### Edge WebSocket Infrastructure

**Cloudflare Durable Objects** have become a production-grade primitive for WebSocket scaling. Each Durable Object acts as a stateful coordination point — a chat room, a document session, a game lobby — with built-in storage and WebSocket support. The Hibernatable WebSocket API is the key innovation: Durable Objects sleep when idle (no billing, no memory) while keeping client connections alive at the Cloudflare edge. When a message arrives, the object wakes, processes it, and can sleep again. This solves the classic "million idle connections" cost problem.

**PartyServer** (formerly PartyKit, now part of Cloudflare) wraps Durable Objects with a developer-friendly API for real-time apps. Each "party" (room) is a Durable Object with lifecycle hooks (onConnect, onMessage, onClose), broadcasting helpers, and built-in Yjs integration via y-partyserver. Scales to tens of thousands of connections per room with hibernation enabled.

### WebRTC and LiveKit

**LiveKit** has emerged as the dominant open-source WebRTC SFU (Selective Forwarding Unit), with 12K+ GitHub stars and SDKs for every major platform. While WebRTC is peer-to-peer by design, LiveKit's SFU architecture makes it practical for 3+ participant scenarios by centralizing stream forwarding — each client uploads one stream to the SFU, which distributes it to all other participants. LiveKit's newer focus is on AI voice agents — acting as the real-time media layer between LLMs and users for conversational AI, which has driven significant adoption in 2025–2026.

## Trade-Off Analysis

| Algorithm | Conflict Resolution | Latency | Complexity | Best For |
|-----------|-------------------|---------|------------|----------|
| OT (Operational Transform) | Server-based transform | Low with central server | Very high — correctness is notoriously hard | Google Docs, text editing with central server |
| CRDT (Conflict-free Replicated Data Types) | Automatic mathematical convergence | Low — peer-to-peer possible | High — limited data structures | Decentralized editing, offline-first, Figma |
| Last-writer-wins (LWW) | Timestamp-based, lossy | Lowest | Trivial | Non-collaborative fields, simple state sync |
| Lock-based (pessimistic) | Prevent conflicts — lock before edit | Varies | Low | Cell-level locking in spreadsheets, record-level editing |

| Transport | Latency | Scalability | Connection Overhead | Best For |
|-----------|---------|------------|--------------------|---------| 
| WebSocket | Very low — persistent, bidirectional | Moderate — stateful connections | High — one connection per client | Real-time editing, chat, gaming |
| SSE (Server-Sent Events) | Low — server push only | Good — lighter than WebSocket | Low — one-way, reconnects automatically | Live dashboards, notifications, one-way updates |
| Long polling | Moderate — new HTTP request per update | Good | Moderate | Fallback when WebSocket is blocked |
| WebRTC | Lowest — peer-to-peer | Limited — mesh doesn't scale | High — ICE/STUN/TURN setup | Video/audio, peer-to-peer data sharing |

**CRDTs have won for new projects**: Google Docs still uses OT, but virtually all new collaborative editors (Figma, Notion-like tools, BlockSuite, AFFiNE) use CRDTs. The ecosystem now offers production-grade options at every level: low-level libraries (Yjs, Automerge 3.0, Loro), sync infrastructure (Automerge Repo, PartyServer + y-partyserver, Liveblocks), and full collaboration platforms (Velt, Liveblocks). The remaining trade-off: CRDTs can produce surprising merge results for complex operations (e.g., concurrent list reordering), and metadata overhead grows with edit history — though Automerge 3.0's columnar compression and Yjs's struct merging have dramatically reduced this cost.

## Failure Modes

**WebSocket connection storms**: When a server restarts, all connected clients reconnect simultaneously, potentially overwhelming the new server. Solution: exponential backoff with jitter on reconnection, connection rate limiting at the load balancer.

**CRDT tombstone accumulation**: Deleted elements in CRDTs leave tombstones (metadata marking the deletion). Over time, tombstones consume significant memory. A document with millions of edits accumulates millions of tombstones. Solution: periodic garbage collection of tombstones after all replicas have observed the deletion (requires coordination).

**OT server becomes a bottleneck**: OT requires a central server to order operations. If this server is slow or down, all edits are blocked. Solution: either use CRDTs (decentralized) or run the OT server as a replicated, highly available service.

**Presence ghost users**: A user's browser crashes without sending a disconnect message. Their cursor/presence remains visible to others indefinitely. Solution: heartbeat-based presence with short TTL (5-10 seconds), server-side timeout on missed heartbeats.

**Merge divergence from clock skew**: If operations are ordered by timestamps and clocks are skewed between clients, operations may be applied in different orders on different clients. Solution: use logical clocks (Lamport/vector clocks) rather than wall-clock timestamps for ordering.

**Large document performance**: CRDTs and OT both have metadata overhead that grows with document history. A document with 100K edits may have a metadata payload larger than the visible content. Solution: periodic snapshotting — compress the document state and discard old operation history.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Client Layer (Local-First)"
        C1[Editor A: Yjs/Automerge]
        C2[Editor B: Yjs/Automerge]
    end

    subgraph "Transport Layer (Edge)"
        C1 <-->|Op Delta: WebSocket| WS1[Cloudflare Durable Object]
        C2 <-->|Op Delta: WebSocket| WS1
    end

    subgraph "Persistence & Sync"
        WS1 -->|1. Auth Check| Auth[Auth Svc]
        WS1 -->|2. Snapshot| S3[(Document Snapshots)]
        WS1 -.->|3. Real-time Presence| Redis{Redis: Cursors}
    end

    subgraph "Media Layer"
        C1 <-->|WebRTC: Voice| SFU[LiveKit SFU]
        C2 <-->|WebRTC: Voice| SFU
    end

    style WS1 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style SFU fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **WebSocket Memory**: Budget **~30KB - 50KB** of RAM per concurrent WebSocket connection on the server. A 64GB server can comfortably handle **~1 million** idle connections, but only **~100k - 200k** active ones.
- **Latency Budget**: For "Google Docs" feel, the **Round-Trip Time (RTT)** from local edit to remote visibility must be **< 200ms**.
- **Broadcast Fan-out**: If 100 people are in one document and 1 person types, the server must send **99 messages**. If everyone types at 5 chars/sec, that's **~50,000 messages/sec** per room.
- **CRDT Overhead**: Expect document size to grow by **~2x - 5x** compared to raw text to store character IDs and tombstones for conflict resolution.

## Real-World Case Studies

- **Figma (The CRDT Shift)**: Figma is the primary reason CRDTs became mainstream. They found that traditional Operational Transformation (OT) was too complex for their design tool (where you're not just editing text, but moving rectangles, changing colors, and layering objects). They built a specialized CRDT where every design property is an independent register, ensuring that two users changing the color and the position of the same object never conflict.
- **Google Docs (The OT Pioneer)**: Google Docs is the world's most successful implementation of **Operational Transformation**. They use a central sequencer to "transform" every keystroke. This allows them to support complex features like "Suggesting Mode" and "Version History" more easily than a pure CRDT approach, but it makes offline editing and peer-to-peer sync significantly harder.
- **Discord (WebSockets at Scale)**: Discord maintains over **15 million concurrent WebSocket connections** at any given time. They famously moved from Python to Elixir (and later added Rust) to handle the massive concurrency requirements of their gateway servers. They use a "pub/sub" model where your client only receives messages for the specific channels you are currently looking at, minimizing unnecessary bandwidth.

## Connections

- [[CRDTs]] — The data structures enabling conflict-free collaborative editing
- [[Load Balancing Fundamentals]] — WebSocket connections are long-lived; sticky sessions or L7-aware balancing needed
- [[TCP Deep Dive]] — WebSocket runs over TCP; connection keepalive and lifecycle matter
- [[HTTP Evolution — 1.1 to 2 to 3]] — SSE benefits from HTTP/2 multiplexing; WebSocket negotiation starts as HTTP
- [[Cell-Based Architecture]] — Durable Objects model maps naturally to cell-based isolation per room/document

## Reflection Prompts

1. You're building a collaborative whiteboard with 100 concurrent users. Each user draws strokes (sequences of points). How do you handle concurrent strokes from different users? Would you use OT or CRDTs? How do you handle a user who goes offline for 5 minutes and then reconnects with 50 unsynchronized strokes?

2. Your real-time notification system uses WebSockets. You have 2 million concurrent connections across 50 servers. A user connects to Server 12 and should receive a notification when another user (connected to Server 37) comments on their post. Design the message routing. What happens if Redis pub/sub (your current routing layer) goes down?

## Canonical Sources

- Figma Engineering Blog, "How Figma's multiplayer technology works" — CRDT-based real-time collaboration at scale
- Yjs documentation (yjs.dev) — the leading CRDT library for collaborative editing
- Automerge documentation (automerge.org) — local-first CRDT with Rust core and multi-language bindings
- Martin Kleppmann, "Designing Data-Intensive Applications" Ch. 5 — replication and conflict resolution foundations
- LiveKit documentation (docs.livekit.io) — open-source WebRTC SFU for real-time audio/video
- Cloudflare Durable Objects docs — WebSocket Hibernation API for scalable real-time coordination
- *System Design Interview* by Alex Xu — chat system and notification system design chapters
