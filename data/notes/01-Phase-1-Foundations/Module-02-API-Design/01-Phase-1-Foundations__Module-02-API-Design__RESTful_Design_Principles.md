# RESTful Design Principles

## Why This Exists

REST isn't just "use HTTP and JSON." It's an architectural style with specific constraints that, when followed, produce APIs that are predictable, cacheable, and evolvable. Most APIs that call themselves RESTful are actually "HTTP-based RPC with JSON" — they use POST for everything, encode actions in the URL (`/createUser`, `/deleteOrder`), and ignore HTTP semantics. This works, but it throws away the benefits REST was designed to provide.

The deeper question: what makes an API *good*? It should be predictable (a developer can guess the right endpoint without reading docs), consistent (the same patterns everywhere), and evolvable (you can change the implementation without breaking consumers). REST, when done well, delivers all three.

## Mental Model

Think of a REST API as a library catalog:

- **Resources** are the books. Each has a unique location (URL): `/books/978-0-13-468599-1`.
- **HTTP methods** are the actions you can perform: read the book (GET), add a new book (POST), replace a book on the shelf (PUT), update its metadata (PATCH), remove it (DELETE).
- **Representations** are how the book appears to you: you might get a summary (JSON response with selected fields), the full text, or a different translation — same book, different representation.

The key insight: REST is about *resources and their states*, not about *actions*. You don't `POST /searchBooks?query=distributed`; you `GET /books?query=distributed`. The difference seems cosmetic, but it has cascading implications for caching, idempotency, and tooling.

## How It Works

### Resource Modeling

The hardest part of REST design isn't choosing methods or status codes — it's modeling resources well.

**Resources are nouns, not verbs.**
- Good: `GET /orders/123`, `POST /orders`, `DELETE /orders/123`
- Bad: `POST /createOrder`, `POST /getOrder`, `POST /cancelOrder`

**Use collections and items consistently.**
- Collection: `GET /users` → list of users
- Item: `GET /users/123` → single user
- Sub-resource: `GET /users/123/orders` → orders belonging to user 123
- Sub-item: `GET /users/123/orders/456` → specific order for that user

**What about actions that don't map to CRUD?** This is where REST gets awkward. "Approve an order," "send a notification," "trigger a build" — these are actions, not resource state changes. Common approaches:

1. **Model the action as a state change**: `PATCH /orders/123 { "status": "approved" }`. This works when the action is really just updating a field.
2. **Model the action as a sub-resource**: `POST /orders/123/approval`. The approval is a resource you're creating. This is clean but can lead to proliferating sub-resources.
3. **Accept the RPC**: `POST /orders/123/approve`. Sometimes a verb in the URL is the clearest expression. Pragmatism beats purity.

### HTTP Methods and Their Semantics

| Method | Semantics | Idempotent? | Safe? | Cacheable? |
|--------|-----------|-------------|-------|------------|
| GET | Read a resource | Yes | Yes | Yes |
| POST | Create a resource (or trigger an action) | No | No | No (usually) |
| PUT | Replace a resource entirely | Yes | No | No |
| PATCH | Partially update a resource | No* | No | No |
| DELETE | Remove a resource | Yes | No | No |

*PATCH is not idempotent by spec, but can be made idempotent in practice (e.g., "set name to X" is idempotent; "append to list" is not).

**Why idempotency matters here**: GET, PUT, and DELETE are defined as idempotent — repeating the same request produces the same result. This means clients can safely retry them on network failure without worrying about duplicate side effects. POST is *not* idempotent, which is why you need [[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]] keys for operations like payment creation.

**Why safety matters**: GET and HEAD are "safe" — they don't modify server state. This means caches, prefetchers, and crawlers can call them freely. If your GET endpoint has side effects (logging a page view, incrementing a counter), you'll get unexpected behavior when a CDN caches it or a browser prefetches it.

### Status Codes That Matter

Don't use status codes as a creative expression channel. A small, consistent subset covers 95% of cases:

**Success (2xx)**:
- `200 OK` — Request succeeded, response body has the result
- `201 Created` — Resource created (POST), `Location` header points to the new resource
- `204 No Content` — Request succeeded, no body (common for DELETE)

**Client errors (4xx)**:
- `400 Bad Request` — Malformed request (syntax error, validation failure)
- `401 Unauthorized` — Not authenticated (missing or invalid credentials)
- `403 Forbidden` — Authenticated but not authorized for this action
- `404 Not Found` — Resource doesn't exist (also used to hide the existence of resources from unauthorized users)
- `409 Conflict` — Request conflicts with current state (e.g., creating a resource that already exists, concurrent modification)
- `422 Unprocessable Entity` — Request is syntactically valid but semantically wrong (useful distinction from 400)
- `429 Too Many Requests` — Rate limited (see [[01-Phase-1-Foundations__Module-02-API-Design__Rate_Limiting_and_Throttling]])

**Server errors (5xx)**:
- `500 Internal Server Error` — Something broke server-side
- `502 Bad Gateway` — Upstream dependency returned an invalid response
- `503 Service Unavailable` — Server is overloaded or in maintenance (include `Retry-After` header)
- `504 Gateway Timeout` — Upstream dependency timed out

**The 401 vs 403 confusion**: 401 means "I don't know who you are" (fix: provide credentials). 403 means "I know who you are, and you're not allowed" (fix: get different permissions). Many APIs incorrectly return 403 for both, which makes debugging harder for consumers.

### Response Design

**Envelope vs raw**: Some APIs wrap responses in an envelope: `{ "data": {...}, "meta": {...}, "errors": [...] }`. Others return the resource directly. Envelopes add consistency for pagination and error handling. Raw responses are simpler but require conventions for metadata (use HTTP headers).

**Error responses**: Always return structured errors that help the consumer fix the problem:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body is invalid",
    "details": [
      { "field": "email", "issue": "Must be a valid email address" },
      { "field": "age", "issue": "Must be a positive integer" }
    ]
  }
}
```

Machine-readable error codes (`VALIDATION_FAILED`) for programmatic handling. Human-readable messages for debugging. Field-level details so the consumer knows exactly what to fix.

**Pagination**: For any collection that can grow large, paginate. Two main approaches:

- **Offset-based**: `GET /orders?offset=20&limit=10`. Simple, but breaks if items are inserted/deleted between pages (items shift, you skip or duplicate entries). Performance degrades on large offsets (database must skip N rows).
- **Cursor-based**: `GET /orders?cursor=eyJpZCI6MTIzfQ&limit=10`. The cursor encodes the position (usually the last item's ID or timestamp). Stable under insertions/deletions, performant at any depth. More complex for consumers. Preferred for anything non-trivial.

### HATEOAS: Theory vs Reality

Hypermedia as the Engine of Application State says API responses should include links to available actions:

```json
{
  "id": 123,
  "status": "pending",
  "_links": {
    "self": { "href": "/orders/123" },
    "approve": { "href": "/orders/123/approve", "method": "POST" },
    "cancel": { "href": "/orders/123/cancel", "method": "POST" }
  }
}
```

The theory: clients don't hardcode URLs; they navigate the API by following links. The API becomes self-describing and can evolve URLs without breaking clients.

The reality: almost nobody does this for internal APIs. It adds verbosity, clients still hardcode behavior (they look for the "approve" link by name, which is just hardcoding with extra steps), and the tooling ecosystem (OpenAPI, code generators) doesn't assume HATEOAS. Some public APIs use it (PayPal, parts of GitHub's API), and it has value for long-lived, multi-party integrations where client and server evolve independently. For internal microservice APIs, explicit documentation and versioning are more practical.

**Honest assessment**: HATEOAS is architecturally elegant and theoretically sound. In practice, the industry voted with its feet — strong schemas (OpenAPI, Protobuf, GraphQL SDL) plus explicit versioning won.

## Trade-Off Analysis

| Decision | Pragmatic Choice | Purist Choice | Guidance |
|----------|-----------------|---------------|----------|
| Verbs in URLs for actions | `POST /orders/123/approve` | Model as sub-resource or state change | Use the clearest option for each case; don't contort resource modeling for purity |
| Response envelope | Use for public/external APIs | Skip for internal APIs | Envelopes help diverse consumers; internal APIs can use conventions |
| HATEOAS | Skip for internal APIs | Implement for discoverability | Worth it only for long-lived external integrations with many consumers |
| Pagination | Cursor-based | Offset-based is simpler | Cursor for production APIs; offset is fine for admin tools or small datasets |

## Failure Modes

- **Inconsistent resource naming**: `/getUsers`, `/orders/create`, `/product/{id}` in the same API. Every consumer has to learn each endpoint individually. Prevention: establish naming conventions early and enforce them in code review or linting.
- **Overloaded POST**: Using POST for everything (reads, updates, deletes) because "it's easier." You lose cacheability, retry safety, and semantic clarity. If the API is truly RPC-style, consider gRPC instead of pretending it's REST.
- **Leaking internal models**: Your API response mirrors your database schema 1:1 — including internal IDs, column names, and data that shouldn't be exposed. API resources should be a deliberate public contract, not a database dump.

## Architecture Diagram

```mermaid
graph TD
    Client[Client Browser / App] -->|GET /books/123| LB[Load Balancer]
    LB -->|Forward| API[API Service]
    
    subgraph "REST Resource Handling"
        API -->|Check Cache| Cache{Redis Cache}
        Cache -->|Hit| Return[Return 200 OK + JSON]
        Cache -->|Miss| DB[(Database)]
        DB -->|Fetch Noun| Result[Book Object]
        Result -->|Transform| JSON[JSON Representation]
        JSON -->|Store| Cache
    end
    
    API -->|201 Created| Client2[POST /books]
    API -->|404 Not Found| Client3[GET /missing]

    style API fill:var(--surface),stroke:var(--accent),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Endpoint Naming**: Use **plural nouns** (`/users`, not `/user`).
- **Response Size**: A typical REST response should be **< 10KB** for mobile performance. Use pagination for anything larger.
- **Status Code Usage**: Use **~10-15 standard codes**. Don't over-complicate (e.g., 418 I'm a teapot is fun but useless).
- **Pagination Defaults**: Default to **20-50 items** per page. Never return "all" by default.

## Real-World Case Studies

- **Stripe (The Gold Standard)**: Stripe is widely cited as the best example of a "Pragmatic REST" API. They use plural nouns, standard HTTP verbs, and consistent error objects. Most importantly, they use **expanded resources** (`/charges?expand[]=customer`) to solve the N+1 problem without moving to GraphQL.
- **GitHub (API v3)**: GitHub's REST API is famous for its use of **Hypermedia (HATEOAS)**. Their responses include `url` fields pointing to related resources (e.g., a repository response contains a `commits_url`). While technically "pure," many developers find the extra links verbose and ignore them.
- **PayPal (HATEOAS and Links)**: PayPal's API makes heavy use of the `links` array in responses to guide the client through state transitions (e.g., after creating a payment, the response includes a link to "execute" the payment). This is a rare example of HATEOAS being used effectively in a complex financial workflow.

## Connections

- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_vs_REST_vs_GraphQL]] — REST in context with the other major paradigms
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_Deep_Dive]] — When to replace REST with gRPC for internal service communication; streaming patterns REST cannot match
- [[01-Phase-1-Foundations__Module-02-API-Design__API_Versioning_and_Compatibility]] — How to evolve REST APIs without breaking consumers
- [[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]] — Why HTTP method semantics (idempotent vs not) matter for retry safety
- [[01-Phase-1-Foundations__Module-02-API-Design__Rate_Limiting_and_Throttling]] — Protecting REST endpoints from abuse
- [[01-Phase-1-Foundations__Module-02-API-Design__API_Gateway_Patterns]] — Gateways add cross-cutting REST concerns (auth, rate limiting, transformation)
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] — The data-layer parallel to API contract evolution

## Reflection Prompts

1. You're designing an API for a ride-sharing service. How do you model "request a ride," "driver accepts ride," and "ride completes"? Do you use state changes on a single resource, sub-resources, or action endpoints? What trade-offs does each approach create for real-time updates?

2. A consumer of your API is building a mobile app and complains that your `GET /users/{id}` response returns 40 fields when they only need 3. They want a `GET /users/{id}/summary` endpoint. What are the trade-offs of creating it, and what alternatives exist?

## Canonical Sources

- Fielding, "Architectural Styles and the Design of Network-based Software Architectures" (2000) — the original REST thesis; worth reading Chapter 5 for the actual constraints
- *Designing Web APIs* by Brenda Jin, Saurabh Sahni, Amir Shevat — practical guide to API design decisions
- Stripe API documentation — widely considered the gold standard for REST API design; study their error format, pagination, and versioning
- Google API Design Guide (cloud.google.com/apis/design) — opinionated, well-reasoned guide to resource-oriented API design