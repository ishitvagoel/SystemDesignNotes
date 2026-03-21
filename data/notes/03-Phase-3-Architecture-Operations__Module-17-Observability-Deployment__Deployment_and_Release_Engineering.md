# Deployment and Release Engineering

## Why This Exists

The most common cause of production incidents is deployments. New code, new configuration, new infrastructure — each is a change, and every change is a risk. Release engineering minimizes this risk through controlled rollout strategies: deploy to a small blast radius first, observe, expand or rollback.


## Mental Model

Deployment is landing a plane; release is opening the cabin doors. You can land the plane (deploy code to production) without letting passengers out (enabling the feature for users). **Blue-green** deployment is having two runways: the plane lands on the new runway, and if anything is wrong, traffic controllers redirect to the old runway instantly. **Canary** deployment is letting one passenger out first — if they're fine, open the doors for everyone. **Feature flags** are individual seat belt signs — you can let rows 1-5 deplane (10% of users see the feature) while rows 6-30 stay seated. The critical insight: separating deployment from release gives you a safety net that "deploy and pray" never had.

## Deployment Strategies

### Blue-Green Deployment

Maintain two identical production environments (blue and green). One serves live traffic; the other is idle. Deploy to the idle environment. Verify. Switch traffic (DNS, load balancer, or gateway routing). If the new version fails, switch back instantly.

**Pros**: Instant rollback (just switch traffic back). Zero-downtime deployment. Full environment parity.

**Cons**: Double the infrastructure cost (two full environments). Database compatibility must be maintained — both versions must work with the current database schema (see [[Zero-Downtime Schema Migrations]]).

### Canary Release

Deploy the new version to a small percentage of traffic (1–5%). Monitor SLIs. If healthy, gradually increase (10%, 25%, 50%, 100%). If SLIs degrade, roll back the canary.

**Automated canary analysis**: Tools like Kayenta (Spinnaker), Flagger (Kubernetes), or Argo Rollouts compare canary SLIs to baseline SLIs automatically. If the canary's error rate or latency is statistically worse, the rollout is automatically rolled back.

**Key parameter**: Bake time — how long to wait at each traffic percentage before expanding. Too short misses slow-burning issues. Too long slows deployment velocity.

### Feature Flags

Decouple deployment from release. Deploy the new code to all instances, but gate the new behavior behind a feature flag that's initially disabled. Enable the flag for a subset of users (internal team, beta users, 1% of traffic). Monitor. Expand.

**Advantages over canary**: More granular targeting (enable for specific users, tenants, regions). The code is already deployed everywhere — enabling/disabling is instant (no deploy needed). Multiple features can be independently flagged.

**The debt risk**: Feature flags accumulate. A codebase with 500 flags has complex conditional logic, untested flag combinations, and flags that were "temporary" three years ago. Discipline: every flag has an owner and a removal date. Track flag lifecycle.

### Progressive Delivery

Combines canary + feature flags + automated analysis. The deployment pipeline automatically rolls out to expanding traffic percentages, monitors SLIs at each stage, and promotes or rolls back based on automated analysis.

### GitOps

Store the desired state of infrastructure and deployments in Git. A GitOps controller (ArgoCD, Flux) watches the Git repo and reconciles the actual cluster state with the declared state. Deployments = Git commits. Rollbacks = Git reverts.

**Drift detection**: The controller continuously compares actual state to declared state. If someone manually changes a Kubernetes deployment (kubectl edit), the controller reverts it to match Git. This eliminates configuration drift.

**Benefits**: Audit trail (Git history), declarative (what, not how), reproducible (any environment can be recreated from Git), self-healing (drift detection).

## Rollback Strategies

**Code rollback**: Redeploy the previous version. Straightforward for stateless services. For stateful services, the previous version must be compatible with the current data (if the new version created data in a new format, the old version must handle it).

**Database rollback**: Hard. If the new version ran a migration (added a column, changed a type), rolling back the code means the old code faces a modified schema. Prevention: backward-compatible migrations only ([[Zero-Downtime Schema Migrations]]).

**Dark launches**: Deploy new code to production but don't route user traffic. Send synthetic traffic or shadow production traffic to the new code. Compare outputs. Only enable for real users after verification. This catches bugs without any user impact.

## Trade-Off Analysis

| Strategy | Risk | Rollback Speed | Infrastructure Cost | Complexity | Best For |
|----------|------|---------------|--------------------|-----------|---------| 
| Rolling update | Low-Medium — gradual, but mixed versions run | Medium — roll forward or backward | None extra — updates in place | Low | Default for Kubernetes, most stateless services |
| Blue-green deployment | Low — instant cutover | Instant — switch back to blue | 2x infrastructure during deploy | Medium | Stateless services, when instant rollback is critical |
| Canary deployment | Very low — small blast radius | Fast — route away from canary | Minimal — one canary instance | Medium-High — metrics comparison | User-facing services with measurable SLIs |
| Feature flags (dark launch) | Very low — decouple deploy from release | Instant — toggle flag | None | Medium — flag management overhead | Gradual rollout, A/B testing, kill switches |
| Recreate (stop old, start new) | High — downtime during transition | Slow — must redeploy old version | None | Trivial | Non-production environments, acceptable downtime |

**Separate deployment from release**: Deployment puts new code on servers. Release exposes it to users. Feature flags let you deploy to production without releasing — code sits dormant behind a flag. This means you can deploy risky changes incrementally (merge to main, deploy, enable for 1% of users) instead of all-at-once. It also means rollback is a flag toggle, not a deployment.

## Failure Modes

**Canary metric selection bias**: The canary deployment monitors CPU and error rate, both look healthy. But the canary is serving a latency-sensitive endpoint 30% slower than the baseline. Users experience degradation, but the canary passes because latency wasn't monitored. Solution: monitor canary against all SLIs (latency percentiles, error rate, saturation), not just a subset. Automate canary analysis (Kayenta, Flagger) with multi-metric comparison.

**Feature flag debt accumulation**: Feature flags are added for every release but never cleaned up. After a year, there are 500 active flags. The combinatorial complexity of flag states makes testing impossible. Flag evaluation adds measurable latency. Solution: treat feature flags as temporary (default lifecycle: 30 days), require an owner and expiration date for each flag, and automate flag cleanup alerts.

**Database migration incompatible with rollback**: A deployment includes a database migration that removes a column. The new code doesn't use the column, so the deploy succeeds. But rolling back to the old code requires the column — rollback fails. Solution: separate deployment from database migration. Use the expand-and-contract pattern: deploy new code that doesn't use the column, then remove the column in a separate step.

**Blue-green deployment state divergence**: The green environment is promoted to live. The blue environment still has the old state (old database connections, old cached data). A rollback to blue serves stale state. Solution: both environments should share the same stateful backends (database, cache). The blue-green switch only affects the compute layer, not the data layer.

**Rolling update partial failure**: During a rolling update, 3 of 10 instances are updated. The new version has a memory leak that manifests after 30 minutes. The rolling update completed "successfully," but 30 minutes later, the 3 new instances start crashing. Solution: extend canary observation windows beyond the deploy duration, monitor for delayed failure modes (memory leaks, connection leaks, thread leaks), and use progressive delivery with automated rollback.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Deployment Pipeline"
        Merge[Merge to Main] --> Build[Build & Test]
        Build --> Deploy_C[Deploy Canary: 1%]
    end

    subgraph "Automated Canary Analysis"
        Deploy_C --> Monitor{Monitor SLIs}
        Monitor -- "Latency/Error spike" --> Rollback[Auto-Rollback]
        Monitor -- "Healthy" --> Expand[Expand: 10% -> 50% -> 100%]
    end

    subgraph "Feature Lifecycle"
        Expand --> Release[Release: Toggle Feature Flag]
        Release --> Cleanup[Cleanup: Remove Flag]
    end

    style Monitor fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Rollback fill:var(--surface),stroke:#ff4d4d,stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Deployment Frequency**: Top-performing teams (Elite) deploy **multiple times per day**. Low performers deploy once per month.
- **Canary Bake Time**: Wait at least **15 - 30 minutes** at the 1% stage to catch memory leaks or slow-burning regressions.
- **Rollback SLA**: Aim for a **< 2 minute** rollback time. This is why Blue-Green (instant traffic switch) or Feature Flags (Boolean toggle) are preferred for high-risk changes.
- **Flag Density**: Limit yourself to **< 20 concurrent active feature flags** per team. Any more creates a testing nightmare of combinatorial states.

## Real-World Case Studies

- **Knight Capital (The $440M Deploy Failure)**: In 2012, Knight Capital went bankrupt in 45 minutes because of a bad deployment. They repurposed an old flag but forgot to update one of their 8 servers. That single server started executing a discontinued algorithm, causing a massive financial loss. This incident is the industry's strongest warning for **automated configuration management** and **decommissioning old code**.
- **Netflix (Kayenta)**: Netflix built **Kayenta**, an automated canary analysis tool. It uses statistical tests (like the Mann-Whitney U test) to compare thousands of metrics from a canary group vs. a baseline group. If the canary is statistically worse, Kayenta kills the deployment automatically, allowing Netflix to deploy thousands of times a day with extreme confidence.
- **Facebook (Gatekeeper)**: Facebook uses **Gatekeeper** to manage feature releases. They can enable a feature for just "employees in the London office" or "10% of users in Brazil." This extreme granularity allows them to "Dark Launch" massive features (like the original Facebook Chat) to production months before they are visible to users, ensuring the infrastructure can handle the load.

## Connections

- [[Observability and Alerting]] — Canary analysis requires observability; SLI monitoring drives promotion/rollback
- [[Zero-Downtime Schema Migrations]] — Database changes must be coordinated with deployment strategies
- [[SLOs SLIs and Error Budgets]] — Error budget informs deployment velocity

## Reflection Prompts

1. Your team deploys to Kubernetes using rolling updates. A new deployment introduces a subtle bug that increases p99 latency from 200ms to 800ms, but p50 and error rate are unchanged. The rolling update completes "successfully" because the readiness probe only checks that the pod responds with 200 OK. How would you redesign your deployment pipeline to catch this?

2. You have 200 active feature flags in production. A bug report comes in: "Feature X doesn't work for users in Germany." After investigation, you find that the bug only manifests when flags A, B, and C are all enabled — a combinatorial interaction nobody tested. How would you reduce the risk of flag interactions, and what's your strategy for managing 200 flags long-term?

3. A critical hotfix needs to go to production immediately. Your normal deployment pipeline takes 45 minutes (build, test, canary, gradual rollout). The CEO is asking why it can't be deployed in 5 minutes. Design a fast-path deployment process for emergencies that balances speed with safety. What safeguards are non-negotiable even in an emergency?

## Canonical Sources

- *Accelerate* by Forsgren, Humble, Kim — research linking deployment frequency, lead time, and organizational performance
- *Continuous Delivery* by Jez Humble & David Farley — the foundational book on deployment pipelines
- ArgoCD documentation — the standard GitOps controller for Kubernetes
- *Site Reliability Engineering* (Google SRE book) — release engineering chapter