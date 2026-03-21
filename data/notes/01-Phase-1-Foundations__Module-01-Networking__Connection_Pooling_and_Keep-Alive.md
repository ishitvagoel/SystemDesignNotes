# Connection Pooling and Keep-Alive

## Why This Exists

Creating a TCP connection costs at minimum one round-trip (the three-way handshake). Add TLS and you're looking at two to three round-trips before a single byte of application data flows. On a cross-region link with 80ms RTT, that's 160–240ms of pure overhead per connection.

If your service makes 1,000 requests per second to a downstream dependency, and each request opens a new connection, you're burning 160–240 *seconds* of cumulative handshake time per second. You're also paying TCP slow start on every connection — each one starts at ~14KB throughput and ramps up over several RTTs.

Connection pooling eliminates this waste by reusing established connections across multiple requests. It's one of the simplest, highest-leverage performance optimizations in distributed systems.

## Mental Model

Without pooling: every time you need a taxi, you call a new one, wait for it to arrive, take your ride, then send it away. Next ride? Call another taxi, wait again.

With pooling: you have a fleet of taxis parked outside your building. When you need a ride, one is already there, engine running. When you're done, it parks and waits for the next passenger.

## How It Works

### HTTP Keep-Alive (Persistent Connections)

HTTP/1.0 closed the TCP connection after every request-response pair. HTTP/1.1 changed the default to **keep-alive** — the connection stays open after a response, ready for the next request. This is the simplest form of connection reuse.

`Connection: keep-alive` is implicit in HTTP/1.1. The server can close the connection after an idle timeout or after a configured number of requests (`Keep-Alive: timeout=30, max=100`).

**With HTTP/2**, connection reuse is even more natural — a single connection multiplexes all requests. There's no need for a "pool" of connections to the same host; one connection handles everything.

### Application-Level Connection Pools

For database connections, cache connections (Redis), and service-to-service calls, applications maintain an explicit pool:

**Core parameters**:
- **Min idle**: Minimum connections kept open even when idle. Avoids cold-start latency when traffic spikes.
- **Max size**: Hard cap on concurrent connections. Protects the downstream service from being overwhelmed.
- **Max idle time**: How long an unused connection stays in the pool before being closed. Too short → you're constantly recreating connections. Too long → you hold connections to a downstream that may have rotated instances.
- **Max lifetime**: Maximum total age of a connection, regardless of activity. Prevents stale connections to instances that have been replaced behind a load balancer. Important in environments where backend instances scale in/out.
- **Connection validation**: Before handing a pooled connection to a caller, check if it's still alive (a "ping" or "SELECT 1"). Adds latency but prevents using a dead connection and getting an error on the first real query.

### The Pool Sizing Problem

**Too small**: Under load, requests queue waiting for a free connection. Latency spikes. If the queue fills, requests fail ("connection pool exhausted"). This is one of the most common production outages in services that talk to databases.

**Too large**: Each connection consumes memory on both the client and the server. PostgreSQL allocates ~10MB per connection. A pool of 200 connections × 50 service instances = 10,000 database connections = ~100GB of database memory consumed before any queries run. This is why connection-pooling proxies like PgBouncer exist — they multiplex thousands of application connections over a smaller number of actual database connections.

**Sizing heuristic (databases)**: For OLTP workloads, optimal pool size ≈ `(number_of_CPU_cores × 2) + disk_spindles` on the database server (HikariCP's recommendation). The reasoning: database work is a mix of CPU computation and I/O wait. More connections than this just increases contention (lock waits, context switches) without increasing throughput.

### Connection Pooling Proxies

When many application instances share a database, each running its own pool, the aggregate connection count can overwhelm the database. Connection pooling proxies sit between the application and the database:

**PgBouncer** (PostgreSQL): Multiplexes hundreds of client connections over a small number of server connections. Three modes: session pooling (connection reused after client disconnects — safest), transaction pooling (reused after each transaction — best performance), statement pooling (reused after each statement — breaks multi-statement transactions).

**ProxySQL** (MySQL): Similar concept, plus query routing, read/write splitting, and query caching.

**The trade-off**: Adding a proxy adds a network hop and a new failure domain. But the alternative — hitting PostgreSQL's connection limit and having every new request fail — is worse.

## Trade-Off Analysis

| Strategy | Throughput | Resource Usage | Complexity | Best For |
|----------|-----------|---------------|------------|----------|
| No pooling (connect per request) | Low — handshake overhead per request | Minimal idle resources | Trivial | Low-traffic scripts, one-off batch jobs |
| HTTP Keep-Alive (persistent connections) | Good — avoids TCP+TLS handshake | Moderate — idle connections consume FDs | Low — default in HTTP/1.1 | Web frontends, API gateways |
| Application-level pool (fixed size) | High — pre-warmed connections, no handshake | Bounded — max connections capped | Medium — must tune min/max/idle | Database connections, Redis, gRPC backends |
| HTTP/2 multiplexing | Excellent — single connection, many streams | Low — one connection per host | Low — handled by the protocol | Browser-to-server, service-to-service on HTTP/2 |
| Connection-per-thread (thread-local) | Good — no contention on pool | High — one connection per thread even if idle | Low | Legacy apps with thread-per-request model |

**Key insight**: Pooling is almost always the right default for database and cache connections. The question is how to size the pool. Too large and you exhaust downstream connection limits; too small and requests queue behind pool checkout. The sweet spot is usually `max_pool = downstream_max_connections / number_of_service_instances`, leaving headroom for operational connections.

## Failure Modes

- **Pool exhaustion under load**: The most common failure. All connections are in use, the queue is full, new requests get errors. Root cause is usually either the pool is too small, or a downstream is slow (holding connections longer than expected, so they can't be returned to the pool). This is why circuit breakers on downstream calls are critical — a slow dependency can drain your connection pool.

- **Stale connections after deploy**: Backend instances are replaced (rolling deploy), but pooled connections still point to the old instances. Requests on stale connections fail. Mitigation: set `max_lifetime` shorter than your deploy cycle, or use connection validation.

- **Connection leak**: Application code borrows a connection from the pool but never returns it (missing `finally` block, exception before `close()`). The pool gradually empties. Mitigation: always use try-with-resources / context managers; set a `leak_detection_threshold` that logs warnings if a connection is held too long.

- **DNS caching vs connection reuse**: You're pooling connections to `api.dependency.com`. DNS TTL expires and the IP changes (the dependency deployed new instances). But your pooled connections still go to the old IP. This is fine for rolling deploys (old instances drain gracefully), but dangerous if the old IP is dead. Mitigation: honor DNS TTL in your HTTP client (many don't by default), and set `max_lifetime` on pooled connections.

## Connections

- [[TCP Deep Dive]] — Connection pooling exists because TCP handshakes and slow start are expensive; understanding these costs explains why pooling matters
- [[HTTP Evolution — 1.1 to 2 to 3]] — HTTP/2 multiplexing reduces the need for HTTP connection pools; HTTP/1.1 still needs them
- [[Load Balancing Fundamentals]] — Persistent connections interact with load balancing: long-lived connections can cause uneven distribution
- [[Circuit Breakers and Bulkheads]] — Circuit breakers protect connection pools from being drained by slow dependencies
- [[Database Replication]] — Read replicas require separate pools or smart routing (read pool vs write pool)

## Reflection Prompts

1. Your service has 20 instances, each with a connection pool of 50 to a PostgreSQL database. The database can handle 500 connections. You need to add 10 more service instances. What's your strategy?

2. After a rolling deploy of a downstream service, you see a spike in 5xx errors that gradually resolves over 5 minutes. Your HTTP client uses connection pooling with no `max_lifetime`. What's happening?

## Canonical Sources

- HikariCP wiki, "About Pool Sizing" — the definitive write-up on database connection pool sizing, with the formula and reasoning
- PgBouncer documentation — practical reference for PostgreSQL connection pooling
- *Designing Data-Intensive Applications* by Martin Kleppmann — while not focused on pooling, Chapter 1's discussion of latency and throughput provides the "why" for pooling