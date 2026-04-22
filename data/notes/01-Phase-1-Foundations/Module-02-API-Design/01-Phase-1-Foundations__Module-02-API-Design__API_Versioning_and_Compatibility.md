# API Versioning and Compatibility

## Why This Exists

APIs are contracts. The moment a consumer integrates with your API, any change you make can break their code. But systems evolve — you need to add fields, change behavior, deprecate endpoints, fix mistakes. The central tension of API design is: **how do you evolve the contract without breaking existing consumers?**

This isn't a theoretical concern. A breaking API change in a service with 50 internal consumers means 50 teams need to update their code — simultaneously, or with a painful migration period. For public APIs with thousands of external integrators, a breaking change can be existential.

## Mental Model

Think of API versioning like a power outlet standard. When a country adopts a new outlet shape, they don't rip out every existing outlet overnight. Instead, they sell adapters, install new outlets alongside old ones, and wait for old appliances to age out. Some countries (looking at you, UK → EU transitions) are still dealing with this decades later.

The lesson: backward compatibility is cheap to maintain and expensive to break. Design for evolution from day one, and you'll rarely need to "change the outlet shape."

## How It Works

### Backward vs Forward Compatibility

These two concepts are frequently confused:

**Backward compatibility**: New versions of the API can be consumed by old clients. Old client code still works against the new API. This is what most people mean by "don't break existing consumers."

**Forward compatibility**: Old versions of the API can handle requests from new clients. The old server gracefully ignores unknown fields or parameters from a newer client. This is rarer but important for systems where clients and servers upgrade independently (mobile apps, IoT devices, microservices with staggered rollouts).

**The golden rule**: Adding is (usually) safe. Removing or changing is dangerous.

Safe changes (backward-compatible):
- Adding a new optional field to a response
- Adding a new optional parameter to a request
- Adding a new endpoint
- Adding a new enum value (careful — if clients use exhaustive switches, this breaks them)

Breaking changes:
- Removing a field from a response
- Renaming a field
- Changing a field's type (string → integer)
- Making an optional parameter required
- Changing the meaning of an existing field
- Changing error response format

### Versioning Strategies

There's no consensus on the "right" approach. Each has real trade-offs:

**URL path versioning**: `/v1/users/123`, `/v2/users/123`

Most common approach. Simple, explicit, visible. API version is obvious from the URL. Works naturally with routing, documentation, and caching.

The downside: it implies that `/v1/users` and `/v2/users` are different resources, but they usually aren't — they're different *representations* of the same resource. When you bump to v2, you now maintain two complete codepaths. Consumers must actively migrate URLs. Old versions accumulate and are hard to sunset.

**Header versioning**: `Accept: application/vnd.myapi.v2+json` or `Api-Version: 2`

Keeps URLs clean. Separates resource identity from representation version. More "RESTful" in the academic sense.

The downside: version isn't visible in URLs (harder to share, debug, cache). Consumers must remember to set headers. API gateways and CDNs need extra configuration to route based on headers.

**Query parameter versioning**: `/users/123?version=2`

Simple, explicit, no URL pollution. Easy to test by tweaking the parameter.

The downside: mixes resource identification with versioning. Caching is more complex (cache key must include the parameter). Feels ad-hoc.

**Content negotiation**: `Accept: application/json; version=2`

Uses HTTP's built-in content negotiation mechanism. The most "correct" approach per HTTP semantics.

The downside: very few APIs actually do this. Tooling support is weak. Consumers and intermediaries (proxies, CDNs) rarely handle content negotiation well.

### The Stripe Approach (Date-Based Versioning)

Stripe uses a model worth studying: API versions are dates (`2024-06-20`). Each consumer is pinned to the version they first integrated with. Stripe maintains backward compatibility by running request/response through a chain of version transformations — each transformation handles the diff between two adjacent versions.

When a consumer sends a request, Stripe applies all transformations from the consumer's pinned version to the current version (on the way in), and the reverse on the way out. This means Stripe only maintains *one* current implementation internally, but presents each consumer with the API version they expect.

This is elegant but has a cost: the transformation chain grows over time and becomes a testing burden. Stripe invests heavily in automated compatibility testing. For most teams, this level of sophistication is overkill — but the principle (pin consumers, transform at the boundary) is powerful.

### The GraphQL Approach (Versionless Evolution)

GraphQL avoids versioning entirely by design. You add new fields (consumers who don't query them are unaffected) and deprecate old fields with `@deprecated(reason: "Use newField instead")`. Since clients explicitly request the fields they need, adding or deprecating fields doesn't break anyone.

This works well for *additive* evolution. It struggles with *semantic* changes (the meaning of an existing field changes) or *structural* changes (a scalar becomes an object). In those cases, you create a new field with a new name and deprecate the old one — which is effectively versioning at the field level rather than the API level.

### The Protobuf/gRPC Approach (Schema Evolution)

Protocol Buffers handle evolution through field numbers. Each field has a unique number that's used in the binary encoding. Rules: never change a field's number. Never reuse a deleted field's number. Add new fields as optional. This gives you both backward and forward compatibility — old code ignores unknown field numbers, new code uses defaults for missing fields.

This is covered in depth in [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]].

## Trade-Off Analysis

| Strategy | Explicit? | URL-clean? | Multi-version cost | Caching | Best for |
|----------|-----------|------------|---------------------|---------|----------|
| URL path (`/v1/`) | Very | No | High (separate codepaths) | Simple | Public APIs, clear major versions |
| Header | Moderate | Yes | Medium | Complex | Internal APIs, fine-grained versioning |
| Query param | Moderate | Mostly | Medium | Complex | Quick-and-dirty, testing |
| Date-based (Stripe) | High | Yes | Low (transformation chain) | Complex | APIs with many consumers, long lifecycles |
| Versionless (GraphQL) | Implicit | N/A | Low (additive only) | N/A | Client-facing with diverse consumers |

## Production Strategies

**Minimize the need for versioning in the first place.** The best version is no version. If your changes are always additive and backward-compatible, you may never need a v2. This requires discipline: resist renaming fields, resist changing types, add new fields instead of modifying existing ones.

**When you must break compatibility:**
1. Announce the deprecation well in advance (months for public APIs)
2. Provide a migration guide with concrete before/after examples
3. Monitor usage of deprecated endpoints/fields — don't sunset until adoption is near zero
4. Run old and new versions in parallel during the migration period
5. Set a hard sunset date and communicate it repeatedly

**The expand-and-contract pattern for APIs** (mirrors the database migration pattern in [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]]):
1. **Expand**: Add the new field/endpoint alongside the old one. Both work.
2. **Migrate**: Consumers switch to the new field/endpoint.
3. **Contract**: Remove the old field/endpoint once all consumers have migrated.

This pattern avoids big-bang version bumps and lets consumers migrate at their own pace.

## Failure Modes

- **Accidental breaking change**: A developer adds a required field to a request body, breaking all existing consumers. Prevention: API linting in CI (e.g., Spectral for OpenAPI), compatibility test suites that validate old requests still work.
- **Version sprawl**: v1, v2, v3, v4 all running in production, each with subtly different behavior. Bug fixes must be applied to all versions. Testing matrix explodes. Prevention: aggressive sunset policies, date-based versioning (Stripe model) to consolidate the maintenance burden.
- **Silent semantic change**: The field `status` used to return `"active"` or `"inactive"`. A new deploy adds `"suspended"` without updating the version. Consumers with `if status == "active"` treat suspended users as inactive. Prevention: treat new enum values as potentially breaking, document them as such.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Clients"
        C1[Legacy Client - v1]
        C2[Modern Client - v2]
    end

    subgraph "API Gateway and Version Router"
        Gateway[Envoy / Nginx]
    end

    subgraph "Backend Services"
        V1[User Service - v1 Legacy]
        V2[User Service - v2 Multi-Tenant]
    end

    C1 -- "GET /v1/users/123" --> Gateway
    C2 -- "GET /v2/users/123" --> Gateway
    
    Gateway -- "Route to" --> V1
    Gateway -- "Route to" --> V2

    style Gateway fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style V1 fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Deprecation Period**: Public APIs typically require **6-12 months** of deprecation notice. Internal APIs can move faster (**1-3 months**) if consumers are well-monitored.
- **Sunset Threshold**: Do not shut down an old version until traffic is **< 1%** of total requests, or you have identified and contacted every remaining consumer.
- **Header vs URL**: URL versioning is **~2x easier** to debug in logs and browser tools compared to header-based versioning.
- **Maintenance Cost**: Each active major version (`v1`, `v2`, `v3`) roughly **doubles** the testing and documentation surface area.

## Real-World Case Studies

- **Stripe (Date-Based Versioning)**: Stripe is the industry leader in "painless" versioning. Every user is pinned to a specific API date (e.g., `2023-10-16`). Internally, Stripe uses a "transformation chain" that converts the latest data format back into the format the user's version expects. This allows them to iterate daily without breaking 10-year-old integrations.
- **GitHub (REST v3 vs GraphQL v4)**: GitHub famously shifted from a versioned REST API (`api.github.com/v3`) to a "versionless" GraphQL API for its next generation. By allowing clients to request exactly the fields they need, they eliminated the need for `v4`, `v5`, etc., as new features are simply additive fields.
- **Salesforce (Massive Version Support)**: Salesforce is known for supporting dozens of API versions simultaneously (sometimes dating back 15+ years). This is a massive operational burden but a key reason why enterprise customers trust them — their integrations almost never break.

## Connections

- [[01-Phase-1-Foundations__Module-02-API-Design__RESTful_Design_Principles]] — Versioning is about evolving the REST contract
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] — The data-layer equivalent: evolving Protobuf, Avro, and database schemas with backward/forward compatibility
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_vs_REST_vs_GraphQL]] — Each paradigm handles evolution differently (Protobuf field numbers, GraphQL deprecation, REST versioning)
- [[01-Phase-1-Foundations__Module-02-API-Design__API_Gateway_Patterns]] — Gateways can handle version routing and transformation at the edge
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Zero-Downtime_Schema_Migrations]] — The expand-and-contract pattern applies to both API and database changes

## Reflection Prompts

1. You maintain a public REST API with 200+ external integrators. You need to fundamentally restructure the user resource (splitting `address` from a flat string into a structured object). How do you execute this migration without breaking anyone?

2. Your company has 15 microservices, each with its own API. Three of them have reached "v3" and are maintaining all three versions simultaneously. An engineer proposes switching to GraphQL to eliminate versioning. Is this a good idea? What does it actually solve, and what new problems does it introduce?

## Canonical Sources

- Stripe API documentation, "API Versioning" — the reference implementation for date-based versioning with transformation chains
- *Building Microservices* by Sam Newman (2nd ed) — Chapter 5 covers API evolution and compatibility strategies
- Google API Design Guide, "Compatibility" section — opinionated rules for what constitutes a breaking change
- Brandur Leach, "APIs You Won't Hate: API Versioning Has No Right Answer" — an honest assessment of the trade-offs