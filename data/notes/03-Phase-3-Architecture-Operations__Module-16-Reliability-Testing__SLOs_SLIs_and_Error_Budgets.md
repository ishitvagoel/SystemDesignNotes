# SLOs, SLIs, and Error Budgets

## Why This Exists

"The system should be reliable" is meaningless without numbers. How reliable? 99%? 99.99%? Reliable in what dimension — latency, availability, correctness? And what happens when reliability dips? Do you stop shipping features? Do you invest in infrastructure? Without a framework, these conversations become political rather than data-driven.

SLOs turn reliability into a measurable, actionable engineering practice. They answer three questions: **What do we measure?** (SLIs), **What's good enough?** (SLOs), and **How do we manage the trade-off between reliability and velocity?** (error budgets).


## Mental Model

A speed limit for unreliability. Your car (service) has a speedometer (SLIs — measurable indicators like latency and error rate). The speed limit (SLO — your target, e.g., 99.9% availability) tells you how fast you're allowed to go. The gap between the speed limit and your current speed is your error budget — the amount of "speeding" you're allowed before getting a ticket. If you're well under the limit (service is very reliable), you have budget to drive faster (ship features, take risks). If you're near the limit, slow down (freeze deploys, focus on stability). The beauty: it turns the subjective "is our service reliable enough?" into a quantitative "we have 43 minutes of downtime budget remaining this month."

## The Framework

### SLI (Service Level Indicator)

The metric that measures a user-visible quality dimension. An SLI is always a **ratio**: good events divided by total events, producing a number between 0 and 1 (or 0% and 100%).

**The critical principle: measure what the user experiences, not what the server reports.** A server reporting 0% errors while the user sees timeouts (because the load balancer dropped the request before it reached the server) is a broken SLI.

**Choosing SLIs by service type**:

| Service Type | Primary SLI | Formula | Why This Metric |
|-------------|-------------|---------|-----------------|
| Request-serving (API) | Availability | `successful_requests / total_requests` | Users care about "does it work?" |
| Request-serving (API) | Latency | `requests_faster_than_threshold / total_requests` | Users care about "is it fast?" |
| Data processing (pipeline) | Freshness | `data_age < threshold / total_checks` | Consumers care about "is the data current?" |
| Data processing (pipeline) | Correctness | `correct_outputs / total_outputs` | Consumers care about "is the data right?" |
| Storage system | Durability | `objects_not_lost / total_objects` | Users care about "is my data safe?" |

**Where to measure**: At the boundary closest to the user. For an API, measure at the load balancer or API gateway — this captures errors from the infrastructure (overloaded servers returning 503, TLS handshake failures) that server-side metrics miss. For client-facing products, measure in the client (real-user monitoring / RUM).

### SLO (Service Level Objective)

The target value for the SLI, over a defined time window.

**Example**: "99.9% of API requests succeed (return 2xx/3xx) over a 30-day rolling window."

**How to choose the target**: Start by measuring your current performance. If you're currently at 99.95%, setting an SLO of 99.999% means you're immediately out of budget. Setting it at 99.5% gives you a budget you'll never use (no engineering incentive to maintain reliability). **Set the SLO at or slightly below your current performance** — this reflects reality and creates a meaningful budget.

**The cost of each nine**:

| SLO | Allowed Downtime/Errors (30 days) | Engineering Effort |
|-----|----------------------------------|-------------------|
| 99% | 7.2 hours | Basic redundancy, simple monitoring |
| 99.9% | 43 minutes | Automated failover, on-call, load testing |
| 99.99% | 4.3 minutes | Multi-region, chaos engineering, dedicated SRE |
| 99.999% | 26 seconds | Extreme redundancy, formal verification, massive cost |

Each additional nine roughly requires 10× more engineering effort and infrastructure cost. Most user-facing services target 99.9%–99.99%. Internal services can target 99%–99.9%. Very few services genuinely need 99.999%.

### SLA (Service Level Agreement)

A contractual commitment — if the SLO is breached, the customer gets credits or compensation. **SLAs should always be less aggressive than internal SLOs.** If your internal SLO is 99.9%, your external SLA might be 99.5%. This buffer means you address reliability issues before they become contractual breaches.

### Error Budget

The mathematical complement of the SLO: `error_budget = 1 - SLO`.

If SLO = 99.9%, error budget = 0.1%. Over 30 days with 10M requests/day (300M total), you can afford 300,000 errors. That's your budget to spend — on deploys, experiments, migrations, and maintenance that might cause errors.

**Error budget as a policy tool**:
- **Budget remaining (>50%)**: Ship features aggressively. Take calculated risks. Run chaos experiments.
- **Budget depleting (10–50%)**: Increase deploy caution. More canary baking time. Fewer risky changes.
- **Budget exhausted (0%)**: Feature freeze. All engineering effort goes to reliability. No deploys except reliability improvements. This is the teeth of the SLO — it creates real consequences.

**The political power**: Without error budgets, reliability conversations are "we should be more careful" vs "we need to ship faster." With error budgets, the data decides: "We have 40% budget remaining — we can afford to deploy the migration. Let's proceed."

## Multi-Window Burn-Rate Alerts

Traditional threshold alerts ("alert if error rate > 1%") are problematic. A 2-second spike triggers the alert even though the error budget barely moved. A slow 0.3% error rate over 6 hours doesn't trigger the alert but is steadily consuming the budget.

**Burn-rate alerts** solve both problems by asking: **how fast is the error budget being consumed?**

**1× burn rate**: Consuming the budget at exactly the sustainable rate — you'll use 100% of the budget by the end of the window. No alert needed.

**14× burn rate**: Consuming the budget 14× faster than sustainable. At this rate, the entire budget is gone in ~2 days. Alert immediately — this is likely an acute incident.

**3× burn rate**: Consuming 3× faster than sustainable. The budget is gone in ~10 days. This is a slow degradation — maybe a subtle regression in the last deploy. Alert after 6 hours of sustained burn.

**Implementation** (from Google's SRE Workbook):

| Window | Burn Rate | Detection | Resets Quickly? |
|--------|-----------|-----------|----------------|
| 1 hour | 14× | Fast burn (acute incident) | Yes |
| 6 hours | 6× | Medium burn (degradation) | Somewhat |
| 3 days | 1× | Slow burn (chronic issue) | No |

Use multi-window: alert only if BOTH a short window AND a long window exceed the threshold. This eliminates most false positives (short spikes that auto-resolve) while catching sustained issues.

## Trade-Off Analysis

| Approach | Precision | Overhead | Cultural Impact | Best For |
|----------|----------|---------|-----------------|----------|
| Uptime percentage (99.9%) | Low — counts all downtime equally | Low | Weak — "we're at 99.95%" means little | Marketing SLAs, simple availability targets |
| Request-based SLIs (success rate) | High — measures user-perceived quality | Medium — instrumentation needed | Strong — directly tied to user experience | API services, transactional systems |
| Window-based SLOs (rolling 30-day) | Good — smooths transient issues | Medium | Strong — clear error budget tracking | Most services — standard practice |
| Time-based SLIs (latency percentiles) | High — p50, p99, p999 | Medium-High — histogram collection | Strong — catches tail latency issues | Latency-sensitive services, real-time APIs |
| Composite SLOs (availability × latency) | Highest — multi-dimensional quality | High — multiple SLIs combined | Very strong — holistic quality view | Mature organizations, multi-SLI services |

**Error budgets change the reliability conversation**: Without error budgets, reliability is a one-way ratchet — always push for more nines. With error budgets, reliability becomes a budget you spend on velocity. If your SLO is 99.9% (43 minutes/month of downtime budget) and you've used 10 minutes, you have 33 minutes to spend on risky deployments, experiments, and migrations. When the budget is exhausted, freeze changes and focus on reliability. This turns the reliability-vs-velocity debate into a data-driven decision.

## Failure Modes

- **SLO too aggressive**: The team is always out of error budget. Feature velocity drops to zero. Engineers burn out from constant reliability firefighting. The SLO becomes a punishment, not a tool. Fix: relax the SLO to match actual user expectations.
- **SLO too lenient**: The error budget is never used. No incentive to maintain reliability. When a real incident occurs, the team has no practice responding. Fix: tighten the SLO to create a meaningful budget.
- **Wrong SLI**: The SLI measures server-side success rate, but users experience client-side timeouts (load balancer drops requests before they reach the server). The SLI says 99.99%; users experience 99.5%. Fix: measure at the user-facing boundary (load balancer, client RUM).

## Connections

- [[Resilience Patterns]] — Circuit breakers, bulkheads, and degradation are the mechanisms for staying within SLO
- [[Observability and Alerting]] — SLI measurement requires instrumentation; burn-rate alerts require alerting infrastructure
- [[Incident Management]] — Error budget exhaustion triggers incident response and reliability focus
- [[Deployment and Release Engineering]] — Error budget influences deploy velocity and canary bake time

## Reflection Prompts

1. Your API's current performance is 99.95% availability and p99 latency of 180ms. You're setting SLOs for the first time. What targets do you set, and why? A product manager argues for 99.999% because "our users deserve the best." How do you respond?

2. Your team's error budget is exhausted with 10 days left in the month. The product team has a critical feature launch scheduled for next week. Engineering leadership proposes a "one-time exception." What's the argument for proceeding? What's the argument for delaying?

## Canonical Sources

- *Site Reliability Engineering* (Google SRE book) — Chapters 4–5 cover SLOs, error budgets, and their operational application
- *The SRE Workbook* (Google) — Chapter 5 on alerting on SLOs with multi-window burn rates
- Alex Hidalgo, *Implementing Service Level Objectives* — the most comprehensive dedicated treatment
- Sloth (sloth.dev) — open-source tool for generating SLO-based Prometheus recording rules and alerts