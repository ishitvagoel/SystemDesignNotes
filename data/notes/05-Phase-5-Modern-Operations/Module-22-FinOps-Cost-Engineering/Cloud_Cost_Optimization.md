# Cloud Cost Optimization

## Why This Exists

Cloud pricing models are designed to be flexible, but flexibility creates complexity. A single AWS service can have 20+ pricing dimensions (instance type, region, tenancy, payment option, storage class, IOPS tier, data transfer direction). Without deliberate cost optimization, teams default to on-demand pricing for everything — often paying 3–5× more than necessary for stable workloads. Cloud cost optimization is the practice of matching your purchasing model to your usage pattern: committed spend for baseline load, on-demand for variable load, and spot for fault-tolerant batch work.

## Mental Model / Analogy

Think of cloud pricing like housing. **On-demand instances** are hotel rooms — maximum flexibility, highest nightly rate. **Reserved Instances / Savings Plans** are a 1-year apartment lease — cheaper per month, but you're committed. **Spot instances** are house-sitting — incredibly cheap, but you might get kicked out with 2 minutes' notice. The optimal strategy is to lease an apartment for your baseline needs, book hotel rooms for peak seasons, and house-sit whenever you can tolerate the uncertainty.

## How It Works

### Purchasing Models

| Model | Discount vs On-Demand | Commitment | Flexibility | Best For |
|-------|----------------------|------------|-------------|----------|
| **On-Demand** | 0% (baseline) | None | Full | Unpredictable workloads, short-lived environments |
| **Savings Plans (Compute)** | 30–40% | 1 or 3 years of $/hour | Any instance family, region, OS | Stable compute baseline across diverse workloads |
| **Reserved Instances** | 40–72% | 1 or 3 years, specific instance type | Locked to instance family + region | Predictable, steady-state databases, core services |
| **Spot Instances** | 60–90% | None (can be reclaimed) | High (but interruptible) | Batch processing, CI/CD, stateless web tiers, ML training |

### The Coverage Strategy

The goal is to "cover" your baseline usage with committed pricing and handle peaks with on-demand or spot:

1. **Measure baseline**: Identify the minimum compute you consistently use (e.g., the p10 of your daily CPU usage over 3 months)
2. **Cover the floor**: Buy Savings Plans or RIs for 70–80% of baseline — never for peaks
3. **Spot for batch**: Move all fault-tolerant workloads (CI/CD runners, data pipelines, batch jobs) to spot
4. **On-demand for the rest**: Use on-demand for burst capacity above the committed floor

### Right-Sizing

Most instances run at <20% CPU utilization. Right-sizing identifies over-provisioned instances and recommends smaller alternatives.

**How to right-size systematically**:
- Collect 14+ days of CPU, memory, network, and disk metrics
- Flag instances with p95 CPU < 40% and p95 memory < 60%
- Recommend one size down (e.g., `c5.4xlarge` → `c5.2xlarge` = 50% savings)
- Validate with load testing before applying

**Graviton/ARM migration**: AWS Graviton processors provide ~20% better price-performance than x86 equivalents. For workloads in Python, Java, Go, Node.js, or containerized environments, switching from `c5` to `c7g` is often a configuration change with immediate cost benefit.

### Cost Allocation and Tagging

You can't optimize what you can't attribute. Every resource needs tags:
- `team`: Which team owns this resource?
- `environment`: prod / staging / dev
- `service`: Which application or microservice?
- `cost-center`: For finance/chargeback

**Enforce tagging** with AWS Service Control Policies, Azure Policy, or GCP Organization Policies that deny resource creation without required tags.

## Trade-Off Analysis

| Strategy | Savings | Risk | Implementation Effort |
|----------|---------|------|----------------------|
| Right-sizing | 20–50% per instance | Performance regression if undersized | Low (metrics review + resize) |
| Savings Plans | 30–40% | Commitment lock-in; wasted if usage drops | Low (purchase decision) |
| Spot Instances | 60–90% | Interruption; requires graceful handling | Medium (architecture changes) |
| Graviton migration | 15–20% | Compatibility issues with native binaries | Medium (testing, redeployment) |
| Storage lifecycle policies | 40–80% on cold data | Data retrieval latency for archived data | Low (policy configuration) |

## Failure Modes & Production Lessons

- **Over-committing on Reserved Instances**: A team buys 3-year RIs based on current growth projections. Six months later, traffic shifts to a different service or they migrate to containers. The RIs sit unused but still bill. **Lesson**: Prefer Compute Savings Plans over RIs for flexibility. Start with 1-year terms. Never commit more than 70% of baseline.
- **Spot Instance cascade**: A fleet of 100 spot instances gets reclaimed simultaneously during a capacity crunch. The service scales to zero. **Lesson**: Diversify across instance types and AZs. Use spot fleet with allocation strategy `capacity-optimized`. Maintain a minimum on-demand baseline.
- **Tag sprawl and inconsistency**: Teams use different tags (`env` vs `environment` vs `Environment`). Cost reports are useless because resources can't be attributed. **Lesson**: Enforce a tag schema centrally. Deny resource creation without required tags.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Cost-Optimized Compute Strategy"
        Baseline[Baseline Load: 70%] -->|Savings Plan| SP[Committed Pricing: 35% Off]
        Variable[Variable Load: 20%] -->|On-Demand| OD[Full Price, Full Flexibility]
        Batch[Batch/CI: 10%] -->|Spot| Spot[Up to 90% Off]
    end

    subgraph "Feedback Loop"
        Metrics[CloudWatch / Datadog] --> Analyzer[Cost Analyzer]
        Analyzer --> Rec[Right-Sizing Recommendations]
        Rec --> Action[Resize / Tag / Terminate]
    end

    style SP fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Spot fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **The 30% Rule**: An unoptimized cloud environment typically has **~30% waste** that can be eliminated through right-sizing and terminating unused resources.
- **Savings Plan Sweet Spot**: Commit to **70% of your p10 usage** (minimum baseline over 3 months). This ensures you never waste commitment dollars.
- **Spot Savings**: If a workload can tolerate 2-minute interruption, spot pricing saves **60–90%** vs on-demand.
- **Graviton ROI**: For supported workloads, switching to Graviton/ARM saves **~20%** with minimal engineering effort.
- **Tagging Discipline**: Organizations with >90% tag compliance reduce cost attribution time from **weeks to hours**.

## Real-World Case Studies

- **Lyft**: Saved $30M/year by implementing a comprehensive spot instance strategy. They built an internal "Spot Fleet Manager" that diversifies across 40+ instance types and 3 AZs, maintaining 99.9% availability even during spot reclamation events.
- **Airbnb**: Implemented mandatory cost allocation tags and built an internal "Cost Explorer" dashboard. Engineers see their team's cloud spend in real-time, creating accountability. They achieved a 15% reduction in compute spend within 6 months.

## Connections

- [[Cost Engineering and FinOps]] — The broader FinOps cultural framework this fits within
- [[Serverless and Edge Computing]] — Serverless pricing (pay-per-invocation) is an alternative optimization model; the cost crossover between serverless and always-on containers is a key FinOps decision
- [[Inference Serving Architecture]] — GPU compute dominates AI workload costs; spot GPUs are increasingly viable for batch inference
- [[Monitoring and Alerting]] — Cost monitoring requires the same observability infrastructure as performance monitoring

## Reflection Prompts

1. Your team runs 200 `c5.2xlarge` instances 24/7 for a web service. Average CPU utilization is 15%, with spikes to 60% during peak hours (2 hours/day). Design a cost optimization strategy using a combination of Savings Plans, right-sizing, and auto-scaling. What's your expected savings?

2. You're evaluating whether to use spot instances for your production API servers (stateless, behind a load balancer). What architectural requirements must be in place before this is safe? What's your fallback strategy?

## Canonical Sources

- AWS Well-Architected Framework: Cost Optimization Pillar
- Werner Vogels, "The Frugal Architect" (thefrugalarchitect.com) — cost-aware architecture principles
- FinOps Foundation, "FinOps Framework" (finops.org) — the industry standard for cloud financial management
