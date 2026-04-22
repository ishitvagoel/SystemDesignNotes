# Serverless and Edge Computing

## Why This Exists

Serverless abstracts away server management: you deploy a function, and the platform handles scaling, provisioning, and operations. Edge computing moves that function execution to CDN edge locations — closer to users, lower latency. Together, they represent the highest level of infrastructure abstraction: moving from managing **servers** to managing **capabilities**.

But "no servers" doesn't mean "no constraints." Cold starts, execution limits, state management, and cost models create trade-offs that make serverless excellent for some workloads and terrible for others.

## Mental Model

**Serverless** is like renting a car by the minute. You don't own a car, you don't pay for parking when you're not driving, and you don't worry about maintenance. You just drive when you need to. But if you drive 8 hours every day, buying a car is way cheaper — that's the cost crossover point. The downside: the car isn't always warmed up and ready (cold starts), you can't customize the engine (runtime constraints), and switching rental companies means re-learning the dashboard (vendor lock-in).

**Edge computing** is like having vending machines everywhere instead of one central store. The vending machine (edge node) is physically close to the customer, so they get their snack in milliseconds. But vending machines have limited inventory (small compute, limited state), need to be restocked from the central warehouse (origin sync), and can't handle complex orders (computation limits). The best systems use edge for the fast, simple stuff and route complex requests back to the central store.

## The Spectrum of Compute

Infrastructure exists on a spectrum of control vs. convenience:
1. **Virtual Machines (IaaS)**: Full control over the OS. Best for legacy apps, custom kernels, or ultra-steady workloads.
2. **Kubernetes (CaaS/PaaS)**: The "Data Center OS." You manage containers and orchestration. Ideal for complex microservices with long-lived processes or highly predictable high traffic.
3. **Function-as-a-Service (FaaS)**: Ephemeral, event-triggered code execution. The provider handles scaling, patching, and high availability. You provide only the business logic.

## Serverless Architecture

**Model**: Deploy a function. It executes in response to events (HTTP request, S3 upload, DynamoDB stream, queue message). You pay per invocation + execution duration. No traffic = no cost.

**Cold starts**: When a function hasn't been invoked recently, the platform must initialize a runtime (allocate container, load code, initialize dependencies).
- **The Process**: Provision infrastructure -> Download code -> Start runtime (Node/Python/JVM) -> Initialize application code (DB connections, config).
- **Impact**: Latency spikes ranging from 100ms to several seconds.
- **Mitigation**: Provisioned concurrency (pay to keep instances warm), SnapStart (JVM snapshots), or using Go/Rust for sub-100ms initialization.

**Event-Driven "Glue"**: Serverless is most powerful as the "glue" between managed services. Triggers from S3, EventBridge, or Kinesis allow for highly decoupled, reactive systems.

**Serverless-First Databases**: Traditional RDBMS struggle with connection churn. Serverless-native databases (DynamoDB, PlanetScale, Neon) solve this via HTTP/API-based access and instant scaling of storage and throughput.

## Edge Compute

**The evolution**: CDNs started as static caches. Then they added programmability — run code at the edge, next to the user.

**Cloudflare Workers**: V8 isolates (not containers). Sub-millisecond cold starts. Execute JavaScript/Wasm at 300+ global locations. Paired with: KV (global key-value), D1 (SQLite at the edge), Durable Objects (stateful actors).

**WebAssembly (Wasm)**: Enables near-native performance for compiled languages (Rust, C++, Go) in sandboxed environments. Wasm 3.0 and WASI 0.2 enable polyglot microservices composed at the edge.

## State Management in Serverless

The "stateless" framing of serverless doesn't mean you can't have state — it means a function instance doesn't persist state between invocations. This is a crucial distinction because all real applications have state. The patterns for managing it:

**External state store**: DynamoDB, Redis (ElastiCache), or S3 are the natural home for per-request and session state. The function reads and writes to the external store on each invocation. This is simple and works for most use cases, but adds latency (a DynamoDB read adds ~2–5ms per call) and cost (API calls are metered separately).

**Durable execution (Temporal / Azure Durable Functions)**: For multi-step workflows that span minutes or hours (order processing, data pipelines, approval flows), a function's 15-minute timeout is fatal. Durable execution frameworks persist workflow state to a database after each step, allowing the function to "sleep" between steps without holding compute. The workflow resumes on a new function instance when the next step is ready. This is the serverless-native answer to long-running processes — see [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern]] for how orchestration patterns map here.

**Edge state (Cloudflare Durable Objects)**: A Durable Object is a single-threaded stateful actor that runs at a specific edge location. Each object has a unique ID, strong consistency within the object, and persistent storage. They're ideal for: WebSocket hubs (a chat room is one Durable Object), rate limiters (one object per user), and collaborative editing cursors (one object per document). Crucially, this is *not* eventually consistent across edge nodes — the object is the single authoritative point, located where the first request for that ID lands.

## When NOT to Use Serverless

The serverless cost and operational model excels for some workloads and is a poor fit for others:

**Avoid serverless when:**
- **Long-running batch jobs**: Lambda's 15-minute maximum execution time disqualifies it for jobs that run hours. Use containers (AWS Batch, ECS) or a durable execution framework (Temporal).
- **GPU-intensive AI inference**: Lambda has no GPU support. AI inference requires dedicated GPU instances — see [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Inference_Serving_Architecture]]. Edge Workers have even stricter constraints (no GPU, no model loading beyond small Wasm binaries).
- **Consistent sub-50ms latency requirements**: Cold starts are non-deterministic (100ms to several seconds). For strict p99 latency SLOs, provisioned concurrency eliminates cold starts — but provisioned concurrency is essentially always-on compute at a premium price, eroding the serverless cost model.
- **Applications needing OS-level control**: Custom kernel modules, raw socket access, or specific tuning flags require a full VM. Serverless functions run in a managed sandbox.
- **Stateful long-lived connections**: A WebSocket game server maintaining thousands of persistent connections needs a long-lived process, not ephemeral functions. Even Durable Objects have compute limits (30-second CPU time per request, 128MB memory).

The heuristic: serverless is optimal when events are sparse or bursty, functions are short-lived (<seconds), and state lives in managed external stores. When any of these is false, containers or VMs are likely a better fit.

## Vendor Lock-In and Portability

Serverless vendor lock-in is real but often overstated. The risk comes from three sources:

**Trigger lock-in**: AWS Lambda triggered by S3 events, SQS, DynamoDB Streams, and EventBridge — these are proprietary event sources. Moving to GCP Cloud Functions means rewriting all trigger wiring, even if the business logic is identical.

**Managed service dependencies**: A Lambda that calls RDS Proxy, reads from SSM Parameter Store, and publishes to EventBridge is deeply AWS-native. The business logic may be portable, but the infrastructure integration is not.

**Runtime constraints**: Cloudflare Workers' V8 isolate model (no Node.js APIs, no filesystem, no native modules) means code written for Workers won't run on Lambda without modification, and vice versa.

**Mitigation**: Use an abstraction framework (SST, Serverless Framework, Pulumi) to generate provider-specific resources from a provider-agnostic definition. Keep business logic in pure functions with no cloud SDK imports; inject dependencies (storage clients, queue clients) from the handler — the handler is provider-specific, the logic is not. CNCF Knative provides a Kubernetes-based FaaS layer that runs on any cloud and eliminates trigger lock-in, at the cost of more operational complexity than managed Lambda.

## Local Development and Testing

The development experience for serverless has a real gap compared to traditional applications:

**The problem**: Cold start behavior, IAM permissions, VPC networking, and event trigger formats are hard to replicate locally. Unit-testing a Lambda handler is straightforward; integration-testing the full trigger → function → downstream chain is not.

**Tools**: AWS SAM (`sam local invoke`, `sam local start-api`) emulates Lambda locally using Docker. LocalStack provides a full mock of AWS services (S3, DynamoDB, SQS, API Gateway) for local integration testing — expensive operations become instant and free locally. Wrangler runs Cloudflare Workers locally with a near-identical V8 runtime.

**Strategy**: Unit-test business logic in isolation (no cloud SDK). Integration-test with LocalStack or SAM in CI. Accept that some behaviors (actual IAM policy evaluation, VPC DNS resolution, real cold start timing) can only be validated in a real cloud environment — use a dedicated staging AWS account, not production.

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
        Function -->|Push| EB[EventBridge]
        EB -->|Rule| EmailL[Email Lambda]
    end

    subgraph "Origin Cluster (Core State)"
        Function --> DB[(Aurora / DynamoDB)]
    end

    style Edge fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Function fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
    style EB fill:var(--surface),stroke:var(--accent2),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Cost Crossover**: Serverless is cheaper for **< 1-5 million requests/month**. Above this, reserved containers are 3-10x cheaper.
- **Cold Start Latency**: Interpretive (Node/Python) ~100-300ms; Compiled (Java/C#) ~500ms to 10s.
- **Memory/CPU**: In AWS Lambda, CPU scales with memory. **1,792 MB** = 1 full vCPU.
- **Edge Latency**: Edge compute (Workers) **< 20ms** RTT; Regional (Lambda) **~50-150ms**.
- **Payload Limits**: API Gateway (10MB), Lambda (6MB sync).

## Real-World Case Studies

- **LEGO (Serverless Migration)**: LEGO migrated to AWS Lambda and EventBridge to handle massive Black Friday spikes without managing servers, improving site reliability during high-stakes launches.
- **Netflix (Video Encoding)**: Netflix uses thousands of concurrent Lambda functions to process individual chunks of video in parallel, completing hours of encoding in minutes.
- **Figma (Wasm for Performance)**: Figma uses WebAssembly to run its C++ design engine in the browser, achieving near-native performance for complex collaboration.

## Trade-Off Analysis

| Dimension | Serverless (Lambda) | Containers (K8s) | Edge (Workers) |
|-----------|-------------------|-------------------|----------------|
| Cold start | 100ms-10s | None | <5ms |
| Max execution | 15 min | Unlimited | 30s-10min |
| Scaling | Instant | Minutes | Instant |
| Cost (Low) | Near-zero | Fixed | Near-zero |
| Cost (High) | Expensive | Moderate | Cheap |

## Failure Modes

- **Recursive Loops**: A Lambda triggered by S3 that writes back to the same bucket. Always implement emergency kill switches.
- **Connection Exhaustion**: 1000 Lambda instances hitting a traditional DB. Use RDS Proxy or serverless-native DBs.
- **Throttling Screen of Death**: Regional concurrency limits (e.g., 1000). One bad function can starve the whole account. Use Reserved Concurrency.
- **Edge Inconsistency**: Eventual consistency across hundreds of edge locations. A user might see stale data if they hit different PoPs.

## Reflection Prompts

1. You're building an image processing pipeline. Compare a Lambda-based vs container-based architecture. At what volume does the cost crossover happen?
2. A user in Tokyo makes an API call. Design a decision framework (Edge vs Regional vs Central) based on data locality and consistency.
3. Your legacy Java app has a 30s startup. What refactoring is needed to make it "serverless-ready"?

## Connections

- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Kubernetes_and_Platform_Engineering]] — The alternative to serverless for workloads needing long-lived processes, GPU support, or OS-level control; understanding both is required to make the right choice.
- [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Cost_Engineering_and_FinOps]] — The cost crossover between serverless ($/invocation) and containers ($/hour) depends on your request volume and function duration; understand the math before committing.
- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Event-Driven_Architecture_Patterns]] — Serverless is naturally event-driven; the function handler is a consumer in an event-driven system. The patterns (fan-out, filtering, dead-letter queues) apply directly.
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Circuit_Breakers_and_Bulkheads]] — Resilience patterns work differently in serverless: circuit breakers must be implemented in the function itself or at the gateway layer; bulkheads map to reserved concurrency per function.
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern]] — Long-running sagas with serverless functions require durable execution (Temporal, Durable Functions) to survive function timeouts and failures mid-workflow.
- [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Inference_Serving_Architecture]] — AI inference is explicitly a poor fit for current serverless due to GPU requirements and cold start sensitivity; this contrast clarifies when serverless is not the answer.
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__CDN_Architecture]] — Edge compute (Workers, Lambda@Edge) is an extension of the CDN — understanding CDN PoP architecture explains why edge compute has the latency profile it does.

## Canonical Sources

- AWS Lambda documentation — "Best practices for working with AWS Lambda functions" (official, covers memory/CPU, initialization, concurrency)
- Cloudflare Workers documentation — "How Workers works" (V8 isolate model, limits, KV, Durable Objects)
- *Serverless Architectures on AWS* by Peter Sbarski (2nd ed) — practical guide to Lambda-based architectures, including state management and event-driven patterns
- CNCF Serverless Whitepaper v1.0 — vendor-neutral overview of serverless concepts, use cases, and the Knative ecosystem
- Yan Cui, "Production-Ready Serverless" (course/book) — the most practical resource on building observable, cost-efficient Lambda applications in production
