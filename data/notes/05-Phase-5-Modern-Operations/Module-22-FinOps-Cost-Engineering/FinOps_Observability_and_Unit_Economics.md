# FinOps Observability and Unit Economics

## Why This Exists

Knowing your total cloud bill is easy. Knowing what it costs to serve one user, process one transaction, or store one GB of customer data is hard — but that's the number that actually matters. Without **unit economics** (cost per unit of business value), you can't tell if your infrastructure is efficient or wasteful as you scale. A $1M/month bill is fine if you serve 100M users ($0.01/user). It's terrible if you serve 10,000 users ($100/user). FinOps observability transforms raw cloud spend into actionable business metrics.

## Mental Model / Analogy

Imagine running a restaurant where you know the total food cost each month, but not the cost per dish. You can't tell which menu items are profitable and which lose money. FinOps observability is like cost accounting for each dish: ingredient costs (compute), kitchen time (processing), and waste (idle resources). Unit economics tells you the "food cost percentage" for each dish, so you can price the menu correctly, cut unprofitable items, and optimize the ones that matter.

## How It Works

### Unit Economics: Cost Per Business Unit

Define your key business units and track the infrastructure cost per unit:

| Business | Unit | Example Metric |
|----------|------|---------------|
| SaaS product | Cost per active user per month | $0.50/MAU |
| E-commerce | Cost per transaction | $0.03/order |
| API platform | Cost per API call | $0.0001/call |
| Storage service | Cost per GB stored per month | $0.023/GB |
| Streaming | Cost per stream-hour | $0.02/hour |

**How to calculate**: `Unit Cost = (Total Infrastructure Cost for Service) / (Number of Business Units Processed)`

Track this metric over time. If unit cost increases as you scale, your architecture doesn't scale efficiently (cost grows faster than usage). If unit cost decreases, you're benefiting from economies of scale.

### Cost Dashboards

A good FinOps dashboard has three layers:

1. **Executive view**: Total spend, month-over-month trend, forecast vs budget, top 5 cost drivers
2. **Team view**: Spend by team/service, unit economics per service, cost anomalies, right-sizing opportunities
3. **Engineer view**: Per-resource costs, idle resource inventory, tag compliance, spot vs on-demand mix

### Anomaly Detection

Cloud cost anomalies fall into predictable patterns:

- **Spike**: A service suddenly costs 5× more (runaway autoscaling, data transfer explosion, misconfigured job)
- **Drift**: Costs gradually increase 3–5% per week without corresponding traffic growth (resource leaks, orphaned resources)
- **Plateau shift**: Costs jump to a new baseline after a deployment (new service, additional replicas, larger instances)

**Detection approach**: Set alerts on both absolute thresholds (daily spend > $X) and relative thresholds (>20% increase vs same day last week). Use AWS Cost Anomaly Detection, Datadog Cloud Cost Management, or custom alerts on cost metrics.

### Showback vs Chargeback

| Model | How It Works | Pros | Cons |
|-------|-------------|------|------|
| **Showback** | Show teams their cost; no billing consequence | Low friction, educational | Teams may ignore it |
| **Chargeback** | Charge teams' budgets for their usage | Strong accountability | Requires accurate attribution; can discourage experimentation |
| **Hybrid** | Showback for dev/staging, chargeback for production | Balances accountability with flexibility | More complex to implement |

## Trade-Off Analysis

| Approach | Visibility | Accuracy | Implementation Effort |
|----------|-----------|----------|----------------------|
| Cloud provider native tools (AWS Cost Explorer) | Good | High for provider-specific | Low |
| Third-party tools (Kubecost, CAST AI, Vantage) | Multi-cloud, Kubernetes-aware | High | Medium |
| Custom dashboards (Grafana + cost metrics) | Fully customizable | Depends on data quality | High |
| FinOps platform (CloudHealth, Apptio) | Enterprise-grade, multi-cloud | High | Medium (SaaS) |

## Failure Modes & Production Lessons

- **The "untagged 40%"**: 40% of cloud resources have no cost allocation tags. Cost reports show $200K/month as "unattributed." Teams point fingers. Nobody optimizes because nobody owns the cost. **Lesson**: Enforce tagging from day one. Use infrastructure-as-code (Terraform) to mandate tags on all resources. Run weekly reports on untagged resources.
- **Vanity unit economics**: A team reports "cost per request" but includes only compute, not storage, networking, or third-party API costs. The real unit cost is 3× higher. **Lesson**: Define "fully loaded" unit cost that includes all infrastructure components, including shared services allocated proportionally.
- **Alert fatigue**: Cost anomaly alerts fire daily for minor fluctuations ($50 spikes). Engineers ignore all alerts, including the real $50K anomaly. **Lesson**: Set alert thresholds relative to the service's total cost (e.g., alert on >20% change, not absolute dollar amounts). Tune thresholds quarterly.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Data Sources"
        CUR[Cloud Billing API / CUR] --> Pipeline[Cost Data Pipeline]
        Metrics[Usage Metrics: Prometheus] --> Pipeline
        Tags[Resource Tags] --> Pipeline
    end

    subgraph "Processing"
        Pipeline --> Enrich[Enrich: Allocate Shared Costs]
        Enrich --> UnitCalc[Calculate Unit Economics]
        UnitCalc --> Anomaly[Anomaly Detection]
    end

    subgraph "Outputs"
        UnitCalc --> Dashboard[FinOps Dashboard]
        Anomaly --> Alerts[Slack / PagerDuty Alerts]
        Dashboard --> Teams[Team Showback Reports]
    end

    style UnitCalc fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Anomaly fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Cost attribution target**: Aim for **>90% of spend attributed** to a team or service. Below 80% means your cost reports are unreliable.
- **Anomaly threshold**: Alert on **>20% daily cost increase** vs the same day last week. Smaller thresholds create noise; larger ones miss real issues.
- **Unit economics trend**: If your cost-per-unit increases more than **10% quarter-over-quarter** without a product change, investigate architectural efficiency.
- **Shared cost allocation**: For shared services (Kafka cluster, API gateway), allocate costs proportionally by usage (messages produced, requests routed), not evenly across teams.

## Real-World Case Studies

- **Spotify (Cost Per Stream)**: Spotify tracks "cost per stream-hour" as their primary unit economic metric. This lets them evaluate infrastructure investments: a new encoding format that reduces bandwidth by 10% directly translates to measurable $/stream savings across billions of streams.
- **Intuit (FinOps at Scale)**: Intuit built an internal FinOps platform that attributes 95% of their $500M+ annual cloud spend to specific products and teams. Each team has a "cost budget" that's part of their OKRs. Engineers see real-time cost impact of their deployments, creating a culture where cost is a first-class engineering concern.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Cost_Engineering_and_FinOps]] — The FinOps framework this observability practice supports
- [[Cloud_Cost_Optimization]] — Optimization actions informed by cost observability
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — Cost anomaly detection uses the same alerting infrastructure as operational monitoring
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__SLOs_SLIs_and_Error_Budgets]] — Unit economics are a cost SLI; budget overruns are a "cost error budget" violation

## Reflection Prompts

1. Your SaaS product serves 50,000 monthly active users at a total infrastructure cost of $150,000/month ($3/MAU). The business wants to offer a free tier to grow to 500,000 users. How do you determine if the infrastructure can scale cost-effectively, and what unit economics target would you set for the free tier?

2. Your cost anomaly detection alerts fire 15 times per week. Engineers have started ignoring them. Only 2 of the last 30 alerts were actionable. How would you redesign the alerting strategy to reduce noise while still catching real anomalies?

## Canonical Sources

- FinOps Foundation, "FinOps Framework" (finops.org) — industry standard for cloud financial management
- J.R. Storment & Mike Fuller, *Cloud FinOps* (O'Reilly, 2nd ed) — the comprehensive FinOps reference
- AWS Cost and Usage Report documentation — the raw billing data source for AWS cost analysis
