# gRPC vs REST vs GraphQL

## Why This Exists

Every distributed system needs a way for services to talk to each other and for clients to talk to services. The choice of communication paradigm — REST, gRPC, or GraphQL — affects latency, developer experience, evolvability, and operational complexity. This isn't a "one size fits all" decision, and the industry's collective wisdom has shifted significantly over the past decade.

The short answer: REST is the default for public APIs and simple CRUD services. gRPC wins for internal service-to-service communication where performance matters. GraphQL wins when clients have diverse data needs and you want to avoid endpoint proliferation. But the real answer requires understanding the trade-offs.


## Mental Model

Three ways to order at a restaurant. **REST** is a fixed menu — each dish has a number, you order by number, you get exactly what's on the menu. Simple, universal, everyone knows how it works. But if you only want the salad from combo #3, too bad — you get the whole combo (over-fetching). **GraphQL** is a build-your-own-bowl bar — you specify exactly which ingredients you want, and you get exactly that. Flexible and efficient, but the kitchen needs a more complex setup to handle arbitrary combinations. **gRPC** is a walkie-talkie to the kitchen — you and the chef speak in a pre-agreed code (protobuf), communication is fast and compact, but both sides need the codebook. Best for the kitchen staff talking to each other (service-to-service), not for customers walking in off the street (browser clients).

## How Each Works

### REST (Representational State Transfer)

REST is an architectural style (not a protocol) built on HTTP. Resources are identified by URLs, manipulated via HTTP methods (GET, POST, PUT, DELETE), and represented in JSON (usually).

**What REST gets right**: Universally understood. Every language, every platform, every tool supports HTTP+JSON. Caching is built into the protocol (HTTP cache headers). Statelessness makes scaling trivial. URL-based resource identification makes APIs discoverable and debuggable (you can literally call them from a browser).

**Where REST struggles**:
- **Over-fetching**: `GET /users/123` returns the entire user object even if you only need the name. Multiply this across mobile clients on slow networks, and wasted bytes add up.
- **Under-fetching / N+1**: To get a user's posts with comments, you need `GET /users/123`, then `GET /users/123/posts`, then `GET /posts/{id}/comments` for each post. Multiple round-trips, each with its own latency.
- **Endpoint proliferation**: As client needs diversify (mobile needs a subset, web needs a superset, admin dashboard needs a different view), you end up with `/users/123?fields=name,email` or purpose-built endpoints like `/users/123/summary`. This doesn't scale organizationally.
- **No built-in schema**: JSON has no native type system. You rely on documentation (OpenAPI/Swagger) for contracts, but enforcement is optional and drift is common.

**HATEOAS — the forgotten part of REST**: Roy Fielding's original REST thesis includes Hypermedia as the Engine of Application State — APIs should return links to related actions, making the API self-navigating. In practice, almost nobody implements HATEOAS for internal APIs. It adds verbosity and complexity. Some payment APIs (PayPal) and enterprise platforms use it. For most systems, explicit documentation and versioning are more practical than self-describing responses.

### gRPC

gRPC is a high-performance RPC framework built on HTTP/2 and Protocol Buffers. You define services and message types in `.proto` files, generate client and server code, and call remote methods as if they were local functions.

**What gRPC gets right**:
- **Performance**: Protocol Buffers are a binary format — 3–10× smaller than JSON and faster to serialize/deserialize. HTTP/2 multiplexing means multiple concurrent RPCs over one connection.
- **Strong typing**: `.proto` files are the contract. The compiler catches type mismatches at build time, not at runtime. Schema evolution is built into Protobuf (see [[Schema Evolution]]).
- **Streaming**: gRPC natively supports four patterns: unary (request-response), server streaming (one request, stream of responses), client streaming (stream of requests, one response), and bidirectional streaming. This is first-class, not bolted on.
- **Code generation**: Client libraries in 10+ languages generated from the same `.proto` file. No hand-written HTTP clients, no URL construction, no JSON parsing.
- **Deadlines and cancellation**: Propagated across service boundaries. If a client sets a 500ms deadline, every downstream service in the chain knows and can abandon work early when the deadline expires.

**Where gRPC struggles**:
- **Browser support**: Browsers can't make raw HTTP/2 requests with full gRPC framing. You need gRPC-Web (a proxy that translates) or a REST gateway. This makes gRPC awkward for client-facing APIs.
- **Human readability**: Binary Protobuf isn't debuggable with `curl`. You need `grpcurl` or dedicated tools. Logging binary payloads requires deserialization.
- **Load balancing complexity**: gRPC uses long-lived HTTP/2 connections with multiplexed streams. An L4 load balancer sees one connection and can't distribute individual RPCs. You need either L7-aware load balancing (Envoy, Linkerd), client-side balancing (gRPC's built-in resolver + pick_first/round_robin), or a look-aside balancer. This is a real operational pain point.
- **Learning curve**: Protobuf schema design, code generation pipelines, and gRPC middleware (interceptors) are unfamiliar to teams used to REST.

### GraphQL

GraphQL is a query language for APIs. Clients specify exactly what data they need in a structured query, and the server returns exactly that — no over-fetching, no under-fetching.

**What GraphQL gets right**:
- **Client-driven queries**: The client requests exactly the fields and relationships it needs. A mobile client can request `{ user(id: 123) { name, avatar } }` while the web client requests the full profile with nested posts. One endpoint, infinite shapes.
- **Eliminates N+1 round-trips**: A single query can traverse relationships: `{ user(id: 123) { name, posts { title, comments { text } } } }`. The server resolves this in one request.
- **Strong typing + introspection**: GraphQL schemas are typed and introspectable. Clients can discover available queries and types at runtime. Tooling (GraphiQL, Apollo Studio) is excellent.
- **Evolvability**: Add fields without versioning. Deprecate fields gracefully. Clients only request what they use, so removing an unused field doesn't break anyone.

**Where GraphQL struggles**:
- **Caching**: REST's URL-based caching (CDN, browser cache, HTTP caches) doesn't work when every request is a POST with a unique query body. You need application-level caching (Apollo Client's normalized cache, persisted queries with GET) or semantic caching.
- **Authorization complexity**: Field-level authorization is hard. If `user.email` is visible to admins but not to regular users, you need per-field permission checks woven into every resolver. This gets complex fast.
- **Performance unpredictability**: Clients can write arbitrarily deep/wide queries. A naive `{ users { posts { comments { author { posts { ... } } } } } }` can bring down your database. Mitigation: query complexity analysis, depth limiting, rate limiting by cost.
- **Server complexity**: Every field needs a resolver. N+1 database queries are easy to accidentally create server-side (the "DataLoader" pattern solves this, but you must be intentional about it).

**GraphQL Federation — the enterprise-scale pattern**: At companies with many backend teams (Netflix, LinkedIn, Airbnb), a single monolithic GraphQL schema doesn't work. GraphQL Federation (Apollo Federation is the dominant implementation) lets each team own a subgraph for their domain (Users, Products, Orders), and a gateway composes them into a unified supergraph. Clients query the gateway; the gateway decomposes queries and routes sub-queries to the appropriate subgraphs.

This is a first-class architectural pattern, not a niche technique. Netflix's Studio Edge API, LinkedIn's main API, and Airbnb's client-facing API layer all use federation. It aligns well with domain-driven service decomposition (see [[Service Decomposition and Bounded Contexts]]) because each bounded context owns its subgraph.

**Federation trade-offs**: The gateway is a critical path component (potential bottleneck, SPOF). Cross-subgraph joins require careful design (entity references, `@key` directives). Query planning in the gateway adds latency. Schema composition can have conflicts that are only detected at build time.

## Trade-Off Analysis

| Dimension | REST | gRPC | GraphQL |
|-----------|------|------|---------|
| Transport | HTTP/1.1 or 2 | HTTP/2 (required) | HTTP (usually POST) |
| Format | JSON (text) | Protobuf (binary) | JSON (text) |
| Schema | OpenAPI (optional) | .proto (mandatory) | GraphQL SDL (mandatory) |
| Streaming | Awkward (SSE, WebSocket, chunked) | Native (4 patterns) | Subscriptions (WebSocket) |
| Caching | Excellent (HTTP native) | Difficult (binary, multiplexed) | Difficult (POST-based) |
| Browser support | Excellent | Poor (needs proxy) | Excellent |
| Payload efficiency | Over/under-fetching common | Exact (binary, compact) | Exact (client-specified) |
| Performance ceiling | Good | Best | Good (query complexity varies) |
| Learning curve | Low | Medium-high | Medium |
| Debugging | Easy (curl, browser) | Harder (grpcurl, binary) | Medium (GraphiQL, but complex queries are opaque) |

## When to Use What

**REST**: Public-facing APIs, simple CRUD services, webhooks, integrations with external partners, anything that needs to be callable from a browser or curl. REST is the lingua franca of the internet.

**gRPC**: Internal service-to-service communication, especially when latency and throughput matter. Microservice mesh (100+ services calling each other). Streaming use cases (real-time event feeds, bidirectional communication). Polyglot environments where code generation eliminates hand-written clients.

**GraphQL**: Client-facing API layer with diverse clients (mobile, web, third-party). Product teams that ship fast and can't wait for backend endpoint changes. Large organizations with many backend services that need a unified API (via federation).

**You can mix them.** A common pattern: gRPC for east-west (service-to-service), REST or GraphQL for north-south (client-to-server). An API gateway ([[API Gateway Patterns]]) translates between them.

## Failure Modes

**gRPC through browser limitations**: gRPC uses HTTP/2 trailers, which browsers don't expose to JavaScript. You can't call gRPC services directly from a browser without grpc-web (a proxy that translates). This adds latency and operational complexity. Solution: use grpc-web with Envoy proxy, or expose a REST/GraphQL gateway for browser clients and use gRPC for service-to-service.

**GraphQL N+1 query explosion**: A naive GraphQL resolver for `users { posts { comments } }` executes one query for users, N queries for posts (one per user), and M queries for comments (one per post). A single GraphQL request generates hundreds of database queries. Solution: DataLoader pattern (batch + deduplicate within a single request), query complexity limits, and depth limiting.

**GraphQL over-fetching denial of service**: An attacker sends a deeply nested or circular query (`{ user { friends { friends { friends ... } } } }`) that consumes exponential server resources. Solution: query depth limits, complexity scoring (assign cost to each field, reject queries exceeding a threshold), and persisted queries (allowlist only pre-approved queries).

**Protobuf schema compatibility breakage**: Renaming a field, changing a field number, or changing a field type in a .proto file silently corrupts data for clients using the old schema. Field 3 was an int32, now it's a string — old clients decode garbage. Solution: never reuse field numbers, only add new fields with new numbers, use `reserved` to prevent accidental reuse, and run a compatibility checker in CI.

**REST versioning fragmentation**: Running multiple API versions (/v1, /v2, /v3) simultaneously means maintaining multiple codepaths, test suites, and documentation sets. Old versions accumulate technical debt but can't be retired because clients depend on them. Solution: evolution-based versioning (additive changes, deprecation headers), or GraphQL's intrinsic evolution (add fields, deprecate old ones, no versions).

## Architecture Diagram

```mermaid
graph LR
    subgraph Client Tier
        Mobile[Mobile App]
        Web[Web Dashboard]
    end

    subgraph API Gateway / BFF
        Gateway[GraphQL Federation Gateway]
    end

    subgraph Internal Services (Mesh)
        User[User Service]
        Order[Order Service]
        Inv[Inventory Service]
    end

    Mobile -- "GraphQL Query" --> Gateway
    Web -- "GraphQL Query" --> Gateway
    
    Gateway -- "gRPC / Proto" --> User
    Gateway -- "gRPC / Proto" --> Order
    Gateway -- "gRPC / Proto" --> Inv
    
    Order -- "gRPC (Unary)" --> User
    Order -- "gRPC (Streaming)" --> Inv

    style Gateway fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Order fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **Payload Size**: gRPC (Protobuf) payloads are typically **30-50% smaller** than equivalent JSON (REST/GraphQL).
- **Serialization Speed**: Protobuf is **5-10x faster** to serialize/deserialize than JSON in most languages (C++, Go, Java).
- **N+1 overhead**: In REST, fetching a list of 10 items with nested details requires **1 + 10 = 11 requests**. In GraphQL, this is **1 request**.
- **Multiplexing**: A single gRPC connection (HTTP/2) can handle **hundreds** of concurrent streams, avoiding the "head-of-line blocking" seen in HTTP/1.1.

## Real-World Case Studies

- **Netflix (REST -> GraphQL Federation)**: Netflix moved from a "one-size-fits-all" REST API to GraphQL Federation. This allowed their UI teams (TV, Mobile, Web) to fetch exactly what they needed for specific screens without requiring backend teams to constantly create new endpoints.
- **Uber (gRPC for Internal Mesh)**: Uber uses gRPC for almost all internal service-to-service communication. They built "TChannel" (and later transitioned to standard gRPC) to handle the massive scale of their microservices, relying on gRPC's strict schemas and performance to keep latency low in a complex call graph.
- **GitHub (REST & GraphQL)**: GitHub provides both a mature REST API (v3) and a GraphQL API (v4). They use REST for simple integrations and GraphQL for their own frontend and complex data-heavy integrations, demonstrating that the two can coexist effectively.

## Connections

- [[HTTP Evolution — 1.1 to 2 to 3]] — gRPC requires HTTP/2; understanding multiplexing explains gRPC's streaming performance
- [[API Versioning and Compatibility]] — REST, gRPC, and GraphQL handle versioning very differently
- [[API Gateway Patterns]] — Gateways often translate between protocols (REST externally, gRPC internally)
- [[Schema Evolution]] — Protobuf and GraphQL have built-in schema evolution; REST relies on conventions
- [[Load Balancing Fundamentals]] — gRPC's long-lived connections create specific load balancing challenges
- [[Service Decomposition and Bounded Contexts]] — GraphQL Federation aligns with bounded context ownership

## Reflection Prompts

1. You're designing the API layer for a mobile-first product with five backend microservices. The mobile team complains about over-fetching and too many round-trips with your REST APIs. Your backend team is comfortable with REST but has never used GraphQL. How do you evaluate the migration, and what's the migration path?

2. Your internal service mesh uses REST over HTTP/1.1. A performance engineer proposes migrating to gRPC for the critical path (order service → payment service → inventory service). What are the expected latency improvements, and what operational changes are required (load balancing, debugging, monitoring)?

## Canonical Sources

- *Building Microservices* by Sam Newman (2nd ed) — Chapter 5: "Interprocess Communication" covers REST, gRPC, and async messaging patterns
- Fielding, "Architectural Styles and the Design of Network-based Software Architectures" (2000) — the original REST thesis (academic, but foundational)
- gRPC official documentation (grpc.io) — the practical reference for gRPC concepts, streaming patterns, and deadlines
- Apollo GraphQL documentation on Federation — the reference for understanding the supergraph/subgraph architecture
- Netflix Tech Blog, "How Netflix Scales its API with GraphQL Federation" — real-world federation at scale
- LinkedIn Engineering Blog, "How LinkedIn adopted GraphQL Federation" — another federation case study