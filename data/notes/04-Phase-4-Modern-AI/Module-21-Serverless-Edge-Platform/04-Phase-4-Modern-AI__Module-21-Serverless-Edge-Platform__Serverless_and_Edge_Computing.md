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

## Canonical Sources
- AWS Lambda / Cloudflare Workers Documentation.
- *Building Microservices* by Sam Newman (2nd ed) - Chapter 5.
- CNCF, "Serverless Whitepaper v1.0."
