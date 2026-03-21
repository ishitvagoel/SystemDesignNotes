# Cost Engineering and FinOps

## Why This Exists

Cloud spending is the third-largest line item for many tech companies, after headcount and office space. Without active management, cloud bills grow faster than revenue — a developer provisions an oversized instance for testing, never terminates it, and it runs for 18 months before anyone notices. Multiply this across 50 teams and hundreds of services, and you get the cloud waste problem: industry surveys estimate 30–35% of cloud spend is wasted.

Werner Vogels' Frugal Architect laws frame this well: "Cost is a non-functional requirement." Every architectural decision has a cost implication. Ignoring cost at design time means discovering it at invoice time — when it's too late to change the architecture.


## Mental Model

Cloud spending without FinOps is like a restaurant where every chef orders ingredients independently, nobody tracks food waste, and the owner only sees the total grocery bill at month's end. FinOps is hiring a kitchen manager who: tracks the cost of every dish in real time (cost allocation), notices that Chef A ordered 50 kg of truffles that went unused (right-sizing), negotiates bulk ingredient contracts (reserved instances), buys seasonal ingredients from the discount market when possible (spot instances), and makes cost-per-dish visible on every recipe card (unit economics). The shift is cultural as much as technical: engineers must see cloud cost as a first-class engineering metric, like latency or error rate, not just a finance problem.

## TCO Thinking

Total Cost of Ownership goes far beyond the cloud bill:

**Direct costs**: Compute (instance hours, serverless invocations), storage (volume × class + retrieval fees), network (egress is the surprise — $0.09/GB from AWS to the internet), and managed services (RDS, ElastiCache, MSK).

**Operational costs**: Engineering time to maintain, monitor, debug, and upgrade. A "free" open-source database that requires 10 hours/month of DBA time costs $1,000–$2,000/month in engineer salary. A managed service at $500/month might be cheaper in total.

**Opportunity costs**: Engineering time spent on infrastructure instead of product features. Every hour debugging Kafka is an hour not building the feature customers asked for.

**The 10× rule**: A $100/month service requiring 2 engineer-hours/month to maintain costs $100 + (2 × ~$100/hr loaded cost) = $300/month. The operational overhead often exceeds the direct cloud cost for small services. This is why managed services (RDS, CloudSQL, managed Kafka) win for teams without dedicated infrastructure engineers.

## Key Optimization Levers

### Compute Optimization

**Right-sizing**: The highest-ROI optimization. Most instances are over-provisioned. A c5.4xlarge (16 vCPU, 32GB RAM) running at 15% CPU average should be a c5.xlarge (4 vCPU, 8GB RAM) — 75% cost reduction. Monitor actual utilization for 2 weeks, then resize. Tools: AWS Compute Optimizer, Datadog resource recommendations, kubecost (Kubernetes).

**Spot/preemptible instances**: 60–90% cheaper than on-demand. Can be reclaimed with 2-minute notice. The key trade-off:

| Workload | Spot-Safe? | Why |
|----------|-----------|-----|
| Stateless web tier (behind LB) | Yes | LB routes around terminated instances |
| Batch processing (Spark, ML training) | Yes | Checkpointing recovers progress |
| CI/CD workers | Yes | Jobs retry on new instance |
| Databases | No | Termination = potential data loss |
| Single-instance services | No | Termination = outage |

**Reserved instances / Savings Plans**: 1–3 year commitments for 30–60% discount. Use for stable baseline workloads (databases, core infrastructure). The commitment is the trade-off: you're paying whether you use it or not. Reserve only for predictable, steady-state workloads. Use on-demand for variable workloads and spot for fault-tolerant batch.

**Auto-scaling**: Scale compute based on demand — more instances during peak, fewer during off-peak. But auto-scaling is NOT a cost optimization if the baseline is oversized. Right-size first, then auto-scale.

### Storage Optimization

**Lifecycle policies** ([[Object Storage Fundamentals]]): Automatically tier data from hot (S3 Standard, $0.023/GB) to warm (IA, $0.0125/GB) to cold (Glacier, $0.004/GB) based on age. A lifecycle policy that moves data to IA after 30 days and Glacier after 90 days can reduce storage costs by 60–80%.

**Delete what you don't need**: Old log archives, unused snapshots, orphaned EBS volumes, incomplete multipart uploads. AWS Cost Explorer and tools like `cloud-nuke` identify abandoned resources.

### Network Optimization

**Egress is expensive**: $0.09/GB from AWS to the internet. At 100TB/month, that's $9,000/month in pure egress. CDNs ([[CDN Architecture]]) reduce origin egress by 80–95%. Cloudflare R2 has zero egress fees — for egress-heavy workloads, it can eliminate the largest cost component.

**Cross-region transfer**: $0.02/GB between AWS regions. Co-locate services that communicate frequently. A service in US-East calling a dependency in EU-West at 1,000 req/sec with 10KB responses = 10MB/sec × $0.02/GB = ~$500/month just in inter-region transfer.

**VPC endpoints**: Traffic from EC2 to S3/DynamoDB via VPC endpoints avoids NAT Gateway charges ($0.045/GB). At high throughput, NAT Gateway costs more than the actual AWS service.

## FinOps as Code

**Cost anomaly detection**: Automated alerts when spending deviates from forecast. AWS Cost Anomaly Detection, or custom alerts via CloudWatch billing metrics. Catch the developer who accidentally launched 100 GPU instances before the next monthly bill.

**Tagging and attribution**: Tag every resource with `team`, `service`, `environment`. Without tags, cost allocation is guesswork. With tags, you can generate per-team, per-service cost reports. The data changes behavior — teams that see their costs make different decisions than teams operating in a cost-blind void.

**Chargeback/showback**: Showback (inform teams of their costs) changes behavior more than centralized cost management. Teams that see "$15,000/month for the staging environment that nobody uses" tend to clean it up. Chargeback (teams actually pay from their budget) is stronger but politically harder.

**Per-tenant cost attribution** ([[Multi-Tenancy and Isolation]]): Track compute, storage, and network per tenant. This enables usage-based pricing, identifies tenants whose usage doesn't justify their plan, and reveals cross-subsidization (free-tier tenant consuming 10× the resources of a paying tenant).

**Budget enforcement**: Set per-team or per-environment budgets. Alert at 80%, hard-cap at 100% for non-production environments (automatically terminate resources). Terraform and Kubernetes resource quotas enforce guardrails at the infrastructure level.

## Sustainability-Aware Design

**Carbon-aware scheduling**: Schedule non-urgent workloads (batch processing, ML training, backups) in regions and times with the lowest carbon intensity. Google's carbon-intelligent computing shifts workloads to when wind and solar are abundant — reducing carbon footprint without affecting user-facing latency.

**Region selection by energy mix**: Iceland and Scandinavian countries have near-100% renewable energy grids. Running batch workloads there has lower carbon impact than coal-heavy regions. Trade-off: latency for user-facing services must still be optimized for the user's location, not the grid's carbon intensity.

**Efficiency as sustainability**: Right-sizing isn't just cost optimization — running at 60% CPU utilization instead of 15% means needing fewer physical servers, less cooling, and less embodied carbon. Cost efficiency and sustainability are aligned.

## Trade-Off Analysis

| Cost Strategy | Savings | Commitment | Risk | Best For |
|--------------|--------|-----------|------|----------|
| On-demand pricing | 0% (baseline) | None | None | Unpredictable workloads, development environments |
| Reserved instances (1-year) | 30-40% | 1 year | Locked to instance type/region | Stable baseline workloads |
| Reserved instances (3-year) | 50-60% | 3 years | High — may overpay if needs change | Databases, core infrastructure with predictable load |
| Savings Plans (AWS) | 30-60% | 1 or 3 years | Lower than RIs — flexible across instance types | General compute, teams not sure about exact instance needs |
| Spot instances | 60-90% | None | High — can be interrupted with 2-min warning | Batch processing, stateless workers, CI/CD |
| Right-sizing + autoscaling | 20-40% | None | Low — requires monitoring | Every workload — first optimization to do |

**Right-size before you commit**: Teams often buy reserved instances before right-sizing, locking in savings on oversized instances. The correct order: (1) right-size instances based on actual utilization, (2) implement autoscaling where possible, (3) buy reservations/savings plans for the remaining baseline. Tagging and cost allocation are prerequisites — you can't optimize what you can't attribute.

## Failure Modes

- **Cost shock from unexpected egress**: A new feature serves images directly from S3 to users (bypassing CDN). Traffic spikes. The monthly bill arrives with $50,000 in egress charges. Mitigation: always serve public content through a CDN. Monitor egress costs separately and alert on spikes.

- **Reserved instance waste**: Committed to 3-year reserved instances for a service that was decommissioned after 6 months. Paying for idle reservations for 2.5 years. Mitigation: use 1-year commitments (lower discount but lower risk), use Savings Plans (flexible across instance types) instead of Reserved Instances (locked to specific instance type), and review commitments quarterly.

- **Observability cost explosion**: Logging and metrics infrastructure can become the most expensive component. Storing every log line at DEBUG level, retaining metrics at 10-second resolution for 5 years, and tracing 100% of requests costs more than the application itself. Mitigation: log levels (INFO in production, DEBUG only when debugging), metric resolution tiering (10s for recent, 5min after 30 days), and trace sampling (1–10%).

## Connections

- [[Object Storage Fundamentals]] — Storage tiering is a primary cost lever
- [[CDN Architecture]] — CDNs reduce egress costs dramatically
- [[Multi-Tenancy and Isolation]] — Per-tenant cost attribution enables pricing optimization
- [[Serverless and Edge Computing]] — Serverless cost model (per-invocation) vs containers (per-provision)
- [[Geo-Distribution and Data Sovereignty]] — Multi-region multiplies infrastructure cost

## Reflection Prompts

1. Your AWS bill is $150,000/month. You've been asked to reduce it by 30% without affecting performance or availability. Walk through your investigation process: where do you look first, what data do you need, and what are the likely top 3 savings opportunities?

2. Your team uses a Kubernetes cluster with 50 nodes. Average CPU utilization across the cluster is 22%. An engineer proposes moving everything to serverless (Lambda). Another proposes right-sizing the cluster to 20 nodes with more aggressive auto-scaling. A third proposes spot instances for the stateless workloads. Evaluate each proposal's expected savings and risks.

## Canonical Sources

- Werner Vogels, "The Frugal Architect" (thefrugalarchitect.com) — seven laws for cost-aware architecture
- FinOps Foundation (finops.org) — the standard framework for cloud financial management
- *Software Architecture: The Hard Parts* by Ford & Richards — cost as an architectural trade-off
- AWS Well-Architected Framework, Cost Optimization Pillar — practical cost optimization guidance