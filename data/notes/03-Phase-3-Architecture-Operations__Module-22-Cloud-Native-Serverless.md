# Cloud-Native & Serverless

## Why This Exists
In the early days of the web, "scaling" meant buying a bigger server (vertical scaling) or manually racking more machines (horizontal scaling). Cloud-native and Serverless architectures represent the final abstraction of infrastructure: moving from managing **servers** to managing **capabilities**.

The goal is to eliminate "undifferentiated heavy lifting" — patching OS kernels, managing bin-packing on clusters, or paying for idle CPU cycles. Without it, developers spend a significant portion of their time on operations rather than features, and businesses over-provision by 3x or more to handle peak loads that only occur 5% of the time. Serverless allows for a "pay-as-you-grow" model that aligns infrastructure costs directly with business value.

## Mental Model / Analogy
**The Power Grid.**
- **Raw VMs (EC2)**: You own a portable diesel generator. You buy the fuel, maintain the engine, and turn it on/off. It's yours, you control the voltage, but if it breaks, you're in the dark.
- **Managed K8s (EKS/GKE)**: You live in a microgrid community. There's a shared power plant, but you still help manage the distribution lines and decide how much load each house gets. Efficient, but requires technical coordination.
- **Serverless (Lambda)**: You just plug your toaster into the wall. You don't care where the electron comes from or how the plant is cooled. You pay only for the kilowatt-hours you use. If you plug in 100 toasters, the grid handles the surge.

## How It Works

### The Spectrum of Compute
Infrastructure exists on a spectrum of control vs. convenience:
1. **Virtual Machines (IaaS)**: Full control over the OS. Best for legacy apps, custom kernels, or ultra-steady workloads where you want to maximize the utilization of reserved instances.
2. **Kubernetes (CaaS/PaaS)**: The "Data Center OS." You manage containers and orchestration. Ideal for complex microservices with long-lived processes, specific networking needs, or highly predictable high traffic where FaaS costs might exceed compute costs.
3. **Function-as-a-Service (FaaS)**: Ephemeral, event-triggered code execution. The provider handles scaling, patching, and high availability. You provide only the business logic.

### The "Cold Start" Problem
When a serverless function hasn't been called recently, the provider deallocates the execution environment. The next request triggers a "cold start":
- **The Process**: Provision infrastructure -> Download code -> Start runtime (Node/Python/JVM) -> Initialize application code (DB connections, config).
- **The Impact**: Latency spikes ranging from 200ms to several seconds.
- **Mitigation Strategies**:
    - **Provisioned Concurrency**: Pay to keep a set number of execution environments pre-warmed.
    - **Warm-up Pings**: Scheduled events to keep the function active (inexpensive but not guaranteed).
    - **Lean Runtimes**: Using Go or Rust instead of Java or Spring Boot significantly reduces initialization time.
    - **Package Optimization**: Tree-shaking and minimizing dependencies to reduce the size of the code artifact.

### Event-Driven Serverless Architecture
Serverless is most powerful when used as the "glue" between managed services.
- **Triggers**: S3 uploads, DynamoDB streams, Kinesis shards, or HTTP calls via API Gateway.
- **Event Buses (EventBridge)**: The central nervous system. Routes events from producers to consumers based on declarative patterns, enabling a highly decoupled architecture.
- **Message Buffers (SQS/SNS)**: Used to decouple producers from consumers, providing a buffer to handle bursts and ensuring exactly-once or at-least-once delivery.

### Serverless-First Databases
Traditional RDBMS (like RDS Postgres/MySQL) struggle with the high connection churn of serverless functions. Serverless-native databases (DynamoDB, PlanetScale, Neon, Upstash) solve this via:
- **HTTP/API-based access**: Eliminating the need for traditional persistent connection pooling.
- **Instant Scaling**: Scaling storage and throughput (IOPS) independently and automatically.
- **Separation of Storage and Compute**: Modern architectures (like Neon or Aurora Serverless v2) back data on S3-like storage while spinning up compute nodes on demand.

## Trade-Off Analysis

| Approach | Scalability | Cost Model | Operational Effort | Best For |
|----------|-------------|------------|--------------------|----------|
| **Raw VMs (EC2)** | Manual/Auto-scaling Groups | Fixed Hourly/Monthly | High (OS, Patching, Security) | Legacy apps, Custom OS, Steady 24/7 loads |
| **Managed K8s (EKS)** | Rapid (HPA/CA) | Per Cluster + Per Node | Medium (Yaml, Mesh, Scaling) | Complex Microservices, High steady traffic |
| **Serverless (FaaS)** | Instant/Automatic | Per Request + Duration | Low (Logic only) | Spiky traffic, Task automation, Rapid prototyping |

## Failure Modes & Production Lessons
- **The "Serverless Screen of Death" (Throttling)**: Cloud accounts have regional concurrency limits (e.g., 1000 concurrent Lambda executions). If one function enters an infinite loop or spikes, it can consume the entire limit, causing all other functions in that account to fail. **Lesson**: Use "Reserved Concurrency" to sandbox critical functions.
- **Database Connection Exhaustion**: If a Lambda scales to 1,000 instances and each attempts to open a Postgres connection, the database will likely crash. **Lesson**: Use an RDS Proxy or transition to a serverless-native DB with an HTTP API.
- **Recursive Loops**: A Lambda function triggered by an S3 upload that writes back to the same S3 bucket with the same prefix. **Lesson**: Always implement "emergency kill switches" (e.g., a circuit breaker in code or a narrow IAM policy) to prevent runaway costs.
- **Hidden Latency in "Glue"**: While the function itself might be fast, the chain of API Gateway -> Lambda -> SQS -> Lambda can add significant overhead compared to a single long-lived process.

## Architecture Diagram

```mermaid
graph TD
    User((User)) -->|HTTP| AGW[API Gateway]
    AGW -->|Trigger| AuthL[Auth Lambda]
    AuthL -->|Verify| DDB[(DynamoDB)]
    
    AGW -->|Trigger| OrderL[Order Lambda]
    OrderL -->|Push| EB[EventBridge]
    
    EB -->|Rule| EmailL[Email Lambda]
    EB -->|Rule| InvL[Inventory Lambda]
    
    InvL -->|Update| RDS[Aurora Serverless]
    
    subgraph "Event-Driven Core"
    EB
    EmailL
    InvL
    end
    
    style AGW fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style EB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
    style DDB fill:var(--surface),stroke:var(--accent),stroke-width:1px;
    style RDS fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics
- **Execution Timeout**: Standard limit is **15 minutes** (AWS Lambda). Long-running jobs should be moved to Fargate or Batch.
- **Cold Start Latency**: Interpretive runtimes (Node/Python) ~100-300ms; Compiled runtimes (Java/C#) ~500ms to 5s+.
- **Memory/CPU Correlation**: In AWS Lambda, CPU power scales linearly with memory. Allocating **1,792 MB** provides exactly 1 full vCPU.
- **Payload Limits**: API Gateway (10MB), Lambda (6MB synchronous, 256KB asynchronous). Use S3 Presigned URLs for larger data transfers.

## Real-World Case Studies
- **LEGO (Transition to Serverless)**: During peak sales events like Black Friday, LEGO's legacy monolithic system struggled to scale. They migrated to a serverless architecture using AWS Lambda and EventBridge. This allowed them to handle massive traffic spikes without managing servers, significantly reducing operational overhead and improving site reliability during high-stakes launches.
- **Netflix (Video Encoding)**: Netflix utilizes AWS Lambda for their massive video encoding pipelines. When a high-resolution source file is uploaded, thousands of Lambda functions spin up simultaneously to process individual chunks of the video in parallel, completing hours of encoding work in minutes.

## Connections
- [[_Phase 1 MOC]] — Fundamental compute paradigms.
- [[API Gateway Patterns]] — Managing the entry point for serverless functions.
- [[Event-Driven Architecture Patterns]] — The underlying philosophy of serverless systems.
- [[Database Replication]] — How serverless-first databases manage consistency and availability.
- [[Load Balancing Fundamentals]] — Understanding why traditional ELBs are often replaced by API Gateways in serverless.

## Reflection Prompts
1. A financial application requires consistent sub-10ms response times for its API. Why might a pure FaaS approach be problematic here, and how would you architect around it?
2. You have a legacy Java application with a 30-second startup time. What specific refactoring steps are necessary to make this "serverless-ready"?

## Canonical Sources
- *Serverless Architectures on AWS* by Peter Sbarski.
- AWS Whitepaper, "Serverless Lens - AWS Well-Architected Framework."
- Charity Majors, "Serverless: The Future of Distributed Systems?" (Honeycomb.io Blog).
- CNCF, "Serverless Whitepaper v1.0."
