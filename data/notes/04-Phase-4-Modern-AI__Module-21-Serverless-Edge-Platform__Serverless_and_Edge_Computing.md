# Serverless and Edge Computing

## Why This Exists

Serverless abstracts away server management: you deploy a function, and the platform handles scaling, provisioning, and operations. Edge computing moves that function execution to CDN edge locations — closer to users, lower latency. Together, they represent the highest level of infrastructure abstraction: you write code, the platform does everything else.

But "no servers" doesn't mean "no constraints." Cold starts, execution limits, state management, and cost models create trade-offs that make serverless excellent for some workloads and terrible for others.


## Mental Model

**Serverless** is like renting a car by the minute. You don't own a car, you don't pay for parking when you're not driving, and you don't worry about maintenance. You just drive when you need to. But if you drive 8 hours every day, buying a car is way cheaper — that's the cost crossover point. The downside: the car isn't always warmed up and ready (cold starts), you can't customize the engine (runtime constraints), and switching rental companies means re-learning the dashboard (vendor lock-in).

**Edge computing** is like having vending machines everywhere instead of one central store. The vending machine (edge node) is physically close to the customer, so they get their snack in milliseconds. But vending machines have limited inventory (small compute, limited state), need to be restocked from the central warehouse (origin sync), and can't handle complex orders (computation limits). The best systems use edge for the fast, simple stuff and route complex requests back to the central store.

## Serverless Architecture

**Model**: Deploy a function. It executes in response to events (HTTP request, queue message, schedule, file upload). You pay per invocation + execution duration. No traffic = no cost.

**Cold starts**: When a function hasn't been invoked recently, the platform must initialize a runtime (allocate container, load code, initialize dependencies). This adds 100ms–10s of latency on the first invocation. Subsequent invocations reuse the warm container.

Cold start mitigation: provisioned concurrency (keep N instances warm — you pay for idle), smaller deployment packages (faster load), SnapStart (JVM — snapshot pre-initialized state, restore on invocation).

**When serverless wins**: Event-driven workloads (process S3 uploads, respond to webhooks), variable traffic (zero to peak — auto-scales to zero cost at idle), short-lived operations (<15 min), simple APIs (CRUD backends for mobile apps).

**When serverless loses**: Latency-sensitive workloads (cold starts are unacceptable), long-running processes (>15 min Lambda limit), heavy compute (GPUs not available in most serverless), workloads with predictable steady-state traffic (always-on containers are cheaper than paying per-invocation at high throughput).

**Cost crossover**: At low to moderate traffic, serverless is cheaper (pay nothing at idle). At high sustained traffic, dedicated containers are cheaper (amortized cost per request). The crossover is typically 1–10 million requests/month — below this, serverless wins; above this, containers may be cheaper.

## Edge Compute

**The evolution**: CDNs started as static caches. Then they added programmability — run code at the edge, next to the user.

**Cloudflare Workers**: V8 isolates (not containers). Sub-millisecond cold starts. Execute JavaScript/Wasm at 300+ global locations. Limited to CPU-bound work (no disk, no GPU, 128MB memory, 30s execution for HTTP workers). Paired with: KV (global key-value), D1 (SQLite at the edge), R2 (object storage), Durable Objects (stateful actors at the edge).

**Other edge runtimes**: Deno Deploy, Vercel Edge Functions, AWS Lambda@Edge / CloudFront Functions, Fastly Compute@Edge (Wasm-based).

**When edge wins**: Auth/token validation, A/B test routing, personalization, geo-routing, request transformation, bot detection — anything that benefits from sub-10ms latency and doesn't need heavy compute or state.

## WebAssembly in Production

**Wasm 3.0** (standardized September 2025) enables near-native performance for compiled languages (Rust, C++, Go) in sandboxed environments. **WASI 0.2** (WebAssembly System Interface) provides standardized access to system resources (filesystem, networking, clocks).

**Use cases**: Edge compute (Fastly Compute@Edge, Cloudflare Workers run Wasm), plugin systems (extend applications with user-provided Wasm modules, safely sandboxed), server-side execution (Fermyon Spin, wasmCloud — deploy Wasm components as microservices).

**The Wasm component model**: Defines how Wasm modules compose — one module's exports become another's imports. This enables polyglot microservices: a Rust component for performance-critical logic, a Python component for ML inference, composed at deployment.

## Edge-Origin Architecture

**What runs at the edge**: Static assets, auth checks, rate limiting, A/B routing, personalization headers, simple API responses (from edge KV/D1).

**What stays at the origin**: Database writes, complex business logic, transactional operations, anything requiring strong consistency or large state.

**The split**: The edge handles the "fast path" (read-heavy, low-state) and forwards "slow path" requests to the origin. This hybrid reduces origin load and improves latency for the majority of requests.

## Architecture Diagram

```mermaid
graph TD
    subgraph "The Edge (Global PoPs)"
        User[Client: London] --> Edge[Edge Worker: V8 Isolate]
        Edge -->|1. Fast Path| EdgeStore[(Edge KV / D1)]
        Edge -- "2. Auth / A-B Routing" --> Edge
    end

    subgraph "Regional Serverless (Event-Driven)"
        Edge -->|3. Slow Path| Gateway[API Gateway]
        Gateway --> Function[AWS Lambda / Cloud Run]
        Function -->|4. Trigger| S3[(S3 Bucket)]
        S3 -.->|5. Async Job| Lambda2[Image Resizer]
    end

    subgraph "Origin Cluster (Core State)"
        Function --> DB[(Aurora / DynamoDB)]
    end

    style Edge fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Function fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Cost Crossover**: Serverless is cheaper for **< 1 - 5 million requests/month**. Above this, the overhead of "pay-per-invocation" exceeds the cost of a reserved, right-sized container cluster.
- **Cold Start Threshold**: Expect **100ms - 2s** for a cold start in Node/Python, and **up to 5s - 10s** for Java/C#. Use Go or Rust for sub-100ms cold starts if performance is critical.
- **Edge Latency**: Edge compute (Cloudflare Workers) typically responds in **< 10ms - 20ms** total RTT. Regional serverless (AWS Lambda) is **~50ms - 150ms**.
- **Execution Limits**: Most serverless functions cap out at **15 minutes** (AWS) or **30 seconds** (Edge). If your task takes longer, use a persistent container or a background job worker.

## Real-World Case Studies

- **Figma (Wasm for Performance)**: Figma uses **WebAssembly** to run its C++ design engine in the browser. By compiling their core logic to Wasm, they achieved near-native performance on the web, allowing users to collaborate on massive, complex design files with sub-10ms input latency, something that was impossible with pure JavaScript.
- **Coca-Cola (Serverless Migration)**: Coca-Cola moved their vending machine loyalty program to AWS Lambda. They found that their traffic was highly variable (peaks during lunch/events, zero at night). By switching to serverless, they reduced their infrastructure costs by **65%** and eliminated the need for a 24/7 operations team to manage scaling.
- **Discord (Edge for Routing)**: Discord uses edge compute to route users to the nearest voice server. When you join a voice channel, an edge worker calculates the lowest-latency path based on your IP and the available regional clusters, ensuring that your "Push-to-Talk" delay is as low as physically possible.

## Connections

- [[CDN Architecture]] — Edge compute runs at CDN PoPs
- [[Cost Engineering and FinOps]] — Serverless cost model (pay-per-use) vs containers (pay-per-provision)
- [[Kubernetes and Platform Engineering]] — K8s is the alternative to serverless for container-based workloads

## Canonical Sources

- Cloudflare Blog, "How Workers Works" — V8 isolate architecture
- WebAssembly specification (webassembly.org) — Wasm 3.0 and WASI 0.2
- *Designing Distributed Systems* by Brendan Burns (2nd ed, 2024) — serverless and edge patterns

## Trade-Off Analysis

| Dimension | Serverless (Lambda) | Containers (K8s) | Edge (Workers) | Traditional VMs |
|-----------|-------------------|-------------------|----------------|-----------------|
| Cold start | 100ms-10s (language-dependent) | None (always running) | <5ms (V8 isolates) | None |
| Max execution time | 15 min (Lambda) | Unlimited | 30s-10min (varies) | Unlimited |
| Scaling speed | Seconds (concurrent instances) | Minutes (pod scheduling) | Instant (global) | Minutes-hours |
| State management | External only (DynamoDB, S3) | In-pod + external | Very limited (KV only) | Local disk + external |
| Cost at low traffic | Near-zero | Fixed (node cost) | Near-zero | Fixed |
| Cost at high traffic | Expensive (per-invocation) | Moderate | Cheap (included in CDN) | Cheapest |
| Vendor lock-in | High | Low-moderate | High | Low |

**The cost crossover**: Serverless is cheaper below ~1M invocations/month for a typical function. Above that, reserved containers are 3-10x cheaper. The exact crossover depends on function duration, memory, and execution frequency. Always model your expected traffic before committing.

## Failure Modes

**Cold start cascades**: A traffic spike hits a serverless function that hasn't been invoked recently. Every request triggers a cold start simultaneously. For Java/C# functions, cold starts can exceed 5 seconds. Solution: provisioned concurrency, keep-warm pings, or use a language with fast cold starts (Go, Rust, Python).

**Connection pool exhaustion**: Each Lambda instance opens its own database connection. At 1000 concurrent invocations, that's 1000 database connections — most databases can't handle this. Solution: use a connection proxy (RDS Proxy, PgBouncer), or use a connection-less database (DynamoDB, HTTP-based APIs).

**Edge state inconsistency**: Edge compute runs at hundreds of locations. Shared state (KV stores, Durable Objects) has eventual consistency across regions. A user hitting two different edge locations in quick succession may see stale data. Solution: design for eventual consistency, use Durable Objects for strong consistency on specific entities, or route users to a consistent region.

**Vendor lock-in trap**: Your entire backend is Lambda functions with DynamoDB, Step Functions, SNS, and SQS. Migrating to another cloud requires rewriting everything. Solution: keep business logic in portable libraries, use infrastructure-as-code, and evaluate lock-in risk upfront for each service.

**WebAssembly compatibility gaps**: Wasm runs sandboxed code at near-native speed on the edge, but not all languages compile to Wasm easily. File I/O, networking, and threading have limited support. Solution: use Wasm for CPU-bound compute (image processing, data transformation), not for complex I/O-heavy applications.

**Observability blind spots**: Serverless functions are ephemeral — they don't have persistent logs or metrics endpoints. Distributed tracing across hundreds of Lambda invocations is harder than across long-lived services. Solution: structured logging to CloudWatch/external service, OpenTelemetry with Lambda layers, and X-Ray or Datadog for tracing.

## Reflection Prompts

1. You're building an image processing pipeline: users upload photos, which need to be resized into 5 formats and stored. Compare a Lambda-based architecture vs a container-based one. At what upload volume does the cost crossover happen? What about cold start impact on user experience?
2. A user in Tokyo makes an API call. Should it be handled at the edge, in a regional serverless function, or in a central container? Design a decision framework based on: data locality, computation complexity, and consistency requirements.
3. Your company is all-in on AWS Lambda (200+ functions). The CEO asks about multi-cloud strategy. What are the realistic options? What would you preserve and what would you sacrifice?

## Canonical Sources

- AWS Lambda Documentation — https://docs.aws.amazon.com/lambda/
- Cloudflare Workers Documentation — https://developers.cloudflare.com/workers/
- Baldini et al., "Serverless Computing: Current Trends and Open Problems" (2017)
- Caulfield et al., "A Cloud-Scale Acceleration Architecture" (Microsoft Research) — Edge/FPGA computing
- ByteCode Alliance, "WebAssembly System Interface (WASI)" — https://wasi.dev/
