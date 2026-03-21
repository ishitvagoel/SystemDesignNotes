# Resource Right-Sizing and Autoscaling

## Why This Exists

Over-provisioning is the default in most engineering teams — nobody gets paged at 3 AM because they allocated too much CPU. But this "safety margin" approach leads to fleet-wide utilization of 10–20%, meaning 80–90% of compute spend is wasted. Right-sizing and autoscaling are the two complementary techniques for matching resource allocation to actual demand: right-sizing sets the correct baseline, and autoscaling adjusts dynamically around that baseline.

## Mental Model / Analogy

Right-sizing is choosing the right vehicle for your commute. If you're a solo commuter driving a 12-seat van every day, you're wasting fuel (money). Switch to a sedan. Autoscaling is ride-sharing: during rush hour, you add cars; at night, you reduce to a skeleton fleet. The combination — right-sized vehicles that scale with demand — is the goal.

## How It Works

### Right-Sizing: Static Optimization

Right-sizing analyzes historical resource utilization and recommends smaller (or larger) instance types:

**Metrics to collect** (minimum 14 days, ideally 30):
- CPU utilization: p50, p95, p99
- Memory utilization: p50, p95
- Network I/O: peak throughput
- Disk I/O: IOPS, throughput

**Decision thresholds**:
| Metric | Action |
|--------|--------|
| p95 CPU < 40% | Downsize by 1 tier |
| p95 CPU < 20% | Downsize by 2 tiers or consider serverless |
| p95 Memory < 50% | Consider memory-optimized → general-purpose |
| p95 CPU > 80% | Upsize or add autoscaling |

**Common right-sizing mistakes**:
- Right-sizing based on averages instead of p95/p99 — leads to under-provisioning during peaks
- Ignoring memory-bound workloads — CPU may be low but memory is at 90%
- Not accounting for startup spikes — JVM applications spike to 100% CPU during warmup

### Autoscaling: Dynamic Optimization

**Horizontal Pod Autoscaler (HPA)** in Kubernetes or **Auto Scaling Groups (ASG)** in cloud VMs:

| Scaling Metric | Good For | Watch Out For |
|---------------|----------|---------------|
| CPU utilization | General compute | Lagging indicator; scale-up may be too late |
| Request rate (RPS) | Web services | Requires custom metrics |
| Queue depth | Async workers | Best leading indicator for queue-based workloads |
| Custom latency (p99) | Latency-sensitive services | Complex to implement; avoids CPU-based false positives |

**Scale-up fast, scale-down slow**: Scale up aggressively (add 50–100% capacity in one step) to handle traffic spikes. Scale down conservatively (10–20% at a time, with a 5–10 minute cooldown) to avoid oscillation (repeatedly scaling up and down).

### Capacity Planning: The Predictive Layer

Autoscaling is reactive — it responds to current load. Capacity planning is proactive — it anticipates future load:

- **Baseline growth**: If traffic grows 5% month-over-month, plan capacity 3–6 months ahead
- **Event-driven spikes**: Known events (Black Friday, product launches) need pre-scaled capacity
- **Bin-packing**: In Kubernetes, the scheduler "packs" pods onto nodes. If pods request more CPU than they use, nodes are full but CPUs are idle. Set **resource requests** close to actual p95 usage, not worst-case guesses

## Trade-Off Analysis

| Approach | Cost Reduction | Risk | Operational Complexity |
|----------|---------------|------|----------------------|
| Manual right-sizing (quarterly review) | 20–40% | Drift between reviews | Low |
| Automated right-sizing (tools like Kubecost, CAST AI) | 30–50% | Aggressive recommendations may under-provision | Medium |
| Horizontal autoscaling (CPU-based) | 20–40% | Lag during sudden spikes | Low |
| Horizontal autoscaling (custom metrics) | 30–50% | More accurate but harder to implement | Medium |
| Vertical autoscaling (VPA in K8s) | 10–30% | Pod restarts during resize; conflicts with HPA | Medium |

## Failure Modes & Production Lessons

- **Autoscaling death spiral**: A service under high load starts timing out. Health checks fail. The autoscaler sees pods as unhealthy and terminates them, reducing capacity further. More pods fail. **Lesson**: Separate liveness probes (is the process alive?) from readiness probes (can it serve traffic?). Don't kill pods that are slow — remove them from the load balancer.
- **Over-aggressive scale-down**: After a traffic spike, the autoscaler scales down too quickly. A second spike arrives before new pods are ready, causing an outage. **Lesson**: Use a stabilization window (e.g., 10 minutes) before scaling down.
- **Bin-packing waste in Kubernetes**: Teams set resource requests to 2 CPU / 4GB RAM "to be safe." Actual usage is 0.3 CPU / 500MB. Each node fits only 4 pods instead of 20. The cluster needs 5× more nodes than necessary. **Lesson**: Set requests based on measured p95 utilization, not guesses. Use Vertical Pod Autoscaler (VPA) in recommendation mode to suggest correct values.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Right-Sizing Feedback Loop"
        Metrics[Prometheus / CloudWatch] --> Analysis[Utilization Analysis]
        Analysis --> Rec[Resize Recommendations]
        Rec --> Review[Engineer Review]
        Review --> Apply[Apply: Resize Instance / Update Requests]
    end

    subgraph "Autoscaling Loop"
        Load[Incoming Traffic] --> HPA[Horizontal Pod Autoscaler]
        HPA -->|Scale Up| AddPods[Add Replicas]
        HPA -->|Scale Down| RemovePods[Remove Replicas]
        HPA -.->|Metrics| Metrics
    end

    style HPA fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Rec fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Target utilization**: Aim for **40–60% average CPU utilization** for services with autoscaling. Below 40% = over-provisioned. Above 70% = not enough headroom for spikes.
- **Scale-up latency**: A new EC2 instance takes **2–5 minutes** to launch and pass health checks. A new Kubernetes pod takes **10–60 seconds**. Plan your autoscaling sensitivity accordingly.
- **Bin-packing overhead**: In Kubernetes, the kubelet and system processes consume **~10–15% of node resources**. Don't count on 100% of node capacity for application pods.
- **Cold start tax**: Serverless functions (Lambda) have cold starts of **100ms–10s** depending on runtime and package size. Java/JVM cold starts are the worst; Python and Node.js are the fastest.

## Real-World Case Studies

- **Shopify (Black Friday autoscaling)**: Shopify pre-scales their infrastructure 3× before Black Friday based on traffic projections. They use a combination of reserved capacity (baseline) and on-demand burst (auto-scaled). Their "flash sale" load testing tool simulates peak traffic 2 weeks before the event.
- **Netflix (Titus + Auto Scaling)**: Netflix runs all containers on their custom platform Titus. They use a combination of predictive autoscaling (based on daily traffic patterns) and reactive autoscaling (based on real-time CPU). Predictive scaling pre-provisions capacity 10 minutes before expected peak, avoiding the lag of reactive-only scaling.

## Connections

- [[Cost Engineering and FinOps]] — Right-sizing is the most impactful first step in any FinOps initiative
- [[Cloud Cost Optimization]] — Right-sizing feeds into purchasing decisions (smaller instances need smaller commitments)
- [[Cloud-Native and Serverless]] — Kubernetes resource management is where right-sizing meets autoscaling
- [[Load Balancing Fundamentals]] — Autoscaling changes the target group; load balancers must detect new instances

## Reflection Prompts

1. Your Kubernetes cluster has 50 nodes (`m5.4xlarge`, 16 vCPU, 64GB RAM). Average cluster CPU utilization is 22%. How would you diagnose whether the waste is from over-provisioned pod requests, too many nodes, or both? What's your optimization plan?

2. Your web service autoscales on CPU utilization with a target of 60%. During a traffic spike, new pods take 45 seconds to become ready. By the time they're ready, the spike has passed and the autoscaler scales back down. How would you redesign the scaling strategy?

## Canonical Sources

- Kubernetes documentation: Horizontal Pod Autoscaler, Vertical Pod Autoscaler
- AWS Well-Architected Framework: Performance Efficiency Pillar
- Kubecost documentation — Kubernetes cost monitoring and right-sizing recommendations
