# Incident Management

## Why This Exists

Every system will fail. The measure of an engineering organization isn't whether incidents occur — it's how quickly they detect them, how effectively they respond, and how thoroughly they learn from them. The difference between a 5-minute incident and a 5-hour incident is rarely technical capability; it's process, communication, and preparation.

## Mental Model

Think of incident management like a hospital emergency room. The ER doesn't prevent illnesses — it handles them when they arrive. Effective ERs have: **triage** (assess severity immediately), **clear roles** (doctor, nurse, intake coordinator), **protocols** (specific procedures for common conditions), and **post-incident review** (morbidity & mortality conferences to learn from cases). An engineering incident response follows the same pattern.

## Incident Response Framework

### Severity Classification

Before you can respond, you need to know how bad it is. Define severity levels upfront — debating severity during an incident wastes time.

| Level | Definition | Example | Response Time | Who's Involved |
|-------|-----------|---------|--------------|---------------|
| P1 / Critical | Revenue impact, data loss, or complete service outage affecting all users | Payment processing down, database corruption, full site unavailable | Immediate (within 5 min) | On-call engineer + incident commander + engineering leadership |
| P2 / Major | Significant degradation affecting many users or a major feature | Search returns wrong results, 50% latency increase, one region down | Within 30 min | On-call engineer + relevant service owner |
| P3 / Minor | Minor degradation, cosmetic issues, single-user impact | One user can't upload images, admin dashboard slow, non-critical background job stuck | Next business day | Assigned to service owner's backlog |

### Roles During an Incident (for P1/P2)

**Incident Commander (IC)**: Owns the incident. Coordinates response, makes decisions, manages communication. Does NOT debug — their job is orchestration, not engineering. The IC asks "what do we know? what are we trying? what's the ETA?" and removes blockers.

**Operations Lead**: The engineer doing the actual debugging and mitigation. Reads logs, checks dashboards, executes commands. Reports findings to the IC.

**Communications Lead**: Updates stakeholders (internal Slack channels, status page, customer success team). Provides regular updates even when there's nothing new ("we're still investigating, ETA unknown"). Silence during an incident is worse than "no update yet."

**The principle of separation**: The person debugging should NOT be the person communicating or making coordination decisions. Context-switching between debugging, writing Slack updates, and fielding questions from executives destroys effectiveness. Clear roles prevent this.

### The Response Sequence

**1. Detect** (automated): An alert fires (ideally a [[SLOs SLIs and Error Budgets|burn-rate alert]] on an SLO). The on-call engineer is paged.

**2. Triage** (2 minutes): Confirm the alert is real (not a false positive). Assess severity. If P1/P2, declare an incident and page the IC.

**3. Mitigate first, diagnose second**: The immediate goal is to restore service, not to find the root cause. Common mitigations, in order of speed:
- Roll back the last deploy (if the incident correlates with a recent change)
- Scale up / add capacity (if overloaded)
- Toggle a feature flag (if a specific feature is causing the issue)
- Redirect traffic (away from a failing region or instance)
- Restart the service (if it's in a bad state — a blunt but effective reset)

**4. Diagnose**: Once service is restored (or stabilized), investigate the root cause. This can happen in parallel with mitigation if the team is large enough.

**5. Resolve**: Fix the root cause. Verify the fix. Stand down the incident.

**6. Follow up**: Schedule a postmortem. Write it within 48 hours while memory is fresh.

## Blameless Postmortems

The postmortem is the most important artifact of an incident. Its purpose is learning, not punishment.

### Structure

**Timeline**: Exact sequence of events with timestamps. "14:32 — Alert fires: error rate exceeds SLO. 14:34 — On-call acknowledges. 14:37 — IC declared. 14:41 — Deploy rollback initiated. 14:45 — Service restored." Precise timelines reveal bottlenecks in the response (10 minutes to acknowledge? 30 minutes to decide on a mitigation?).

**Impact**: Quantified. "3,200 users experienced errors. 45 minutes of degraded service. $12,000 estimated revenue impact. 0.3% of monthly error budget consumed."

**Root cause**: Technical analysis. "The new deploy included a database migration that added an index on a 500M-row table. The index creation held a lock for 6 minutes, blocking all writes."

**Contributing factors**: What made the incident possible or worse? "The migration wasn't tested against production-sized data. The deploy pipeline doesn't gate on migration duration. The on-call runbook didn't include 'check recent migrations' as a first step."

**Action items**: Specific, assigned, tracked. "Add a migration size check to CI that rejects migrations estimated to take >10 seconds on production data (Owner: Alice, Due: March 15)." "Update the runbook to include migration check (Owner: Bob, Due: March 10)."

### Why Blamelessness Matters

"Bob pushed a bad migration" is a blame statement. It implies Bob was careless or incompetent. The result: Bob (and everyone watching) learns to hide mistakes, not report near-misses, and avoid risky but necessary changes.

"The deploy pipeline allowed a long-running migration to reach production without validation" is a systems statement. It implies the system (pipeline, process, tooling) failed to catch a predictable error class. The result: the pipeline is improved, and the entire team benefits.

**Blamelessness doesn't mean accountability-free.** If an engineer repeatedly ignores documented procedures, that's a management issue — handled in private, not in a postmortem. The postmortem asks "what systemic factors allowed this to happen?" not "who screwed up?"

### Action Item Tracking

A postmortem with 10 action items that are never completed has zero value. Track action items like engineering tickets: assigned, due-dated, reviewed in team retrospectives. If the same class of incident recurs because the action items from the last one were never completed, that's a process failure worth its own postmortem.

## On-Call Practices

### Sustainability

On-call is sustainable when: rotations are 1 week in 4 (minimum), pages are actionable (not false alarms), runbooks exist for every alert, and on-call hours are compensated (time-off-in-lieu or additional pay). Unsustainable on-call (weekly rotation, 5 pages per night, no runbooks) leads to burnout, attrition, and — paradoxically — worse reliability as exhausted engineers make more mistakes.

### Runbooks

For every alert, a runbook answers: **What does this alert mean?** (brief description, what SLI it's measuring), **What should I check first?** (dashboards, logs, recent deploys), and **What are the common mitigations?** (rollback, restart, scale up, toggle feature flag). A good runbook turns a 30-minute investigation into a 5-minute response.

### Toil Reduction

If the same alert fires repeatedly and the same manual remediation is performed, automate the remediation. "Alert: disk usage > 80% → Runbook: run log rotation script" should become "Alert: disk usage > 80% → Automated: log rotation runs, resolves alert, notifies engineer." The goal: on-call handles novel problems, not repetitive tasks.

## Capacity Planning

**Back-of-envelope estimation**: Before building, estimate: how many requests/second? How much storage/year? How much bandwidth? These estimates identify bottlenecks early. Every capstone in this vault starts with estimation.

**N+1 redundancy**: If you need 3 instances for peak load, run 4. One failure doesn't degrade service. N+2 for critical systems (survive two simultaneous failures).

**Regular load testing**: Verify the system handles expected peak load (Black Friday, product launch) with headroom. Don't discover you're under-provisioned when the traffic arrives.

**Capacity alerts**: Alert when a resource exceeds 70% utilization. This gives you time to scale before hitting the ceiling. 70% for disk (running out of disk is an emergency), 80% for CPU/memory (brief spikes above are OK).

## Trade-Off Analysis

| Practice | Overhead | Response Speed | Learning Quality | Best For |
|----------|---------|---------------|-----------------|----------|
| On-call with pager (PagerDuty, Opsgenie) | High — alert fatigue risk | Fast — immediate notification | Depends on follow-up | Production services with SLOs |
| Follow-the-sun rotation | Very high — requires global team | Fast — always business hours | Same | Global services, large organizations |
| Centralized incident commander (IC) | Medium — IC overhead per incident | Organized — clear decision authority | Good — IC drives postmortem | Major incidents, SEV1/SEV2 |
| Swarming (all-hands on major incidents) | High during incident | Fast initial, chaotic without structure | Poor — diffused responsibility | Early-stage teams, when expertise is unclear |
| ChatOps (Slack-driven incident response) | Low — lightweight process | Moderate — asynchronous-friendly | Good — conversation is the log | Most teams — combines speed with documentation |

**The postmortem is more valuable than the response**: Fast incident response prevents damage. Blameless postmortems prevent recurrence. Most teams invest heavily in response tooling but underinvest in postmortem culture. A good postmortem produces action items that reduce future incidents. Without follow-through on action items, postmortems are just paperwork.

## Failure Modes

**Alert fatigue causing missed critical alerts**: On-call engineers receive hundreds of alerts daily — most are informational or false positives. When a real SEV1 occurs, the alert is buried in noise. Response is delayed by minutes or hours. Solution: ruthlessly prune alerts (if an alert doesn't require human action, delete it), deduplicate correlated alerts, and ensure SEV1 alerts use a distinct escalation path (phone call, not just Slack/email).

**Postmortem action items never completed**: Postmortems identify root causes and generate action items. The action items go into a backlog, are deprioritized against feature work, and never completed. The same incident recurs 3 months later. Solution: track postmortem action items separately from the feature backlog, assign ownership and deadlines, and review completion rates in engineering leadership meetings.

**Incident commander bottleneck**: During a major incident, the IC becomes a single point of coordination. All communication goes through them. If the IC is overwhelmed or unfamiliar with the failing system, response slows. Solution: train multiple ICs, separate the IC role (coordinates) from the technical lead role (debugs), and have clear escalation paths for when the IC needs help.

**Blame culture suppressing honest postmortems**: Engineers fear being blamed for incidents, so postmortems avoid naming root causes that implicate individuals. The real systemic issues are never addressed. Solution: enforce blameless postmortems at the organizational level, focus on system failures (why did the system allow this?) rather than human failures (who did this?), and have leadership model blamelessness.

**Runbook rot**: Runbooks written 2 years ago reference systems, URLs, and procedures that no longer exist. During an incident, the on-call follows the runbook and makes things worse. Solution: review runbooks as part of game days, attach runbooks to alerts (so they're tested whenever the alert fires), and date-stamp runbooks with a "last verified" field.

## Connections

- [[SLOs SLIs and Error Budgets]] — Error budget exhaustion triggers reliability focus
- [[Resilience Patterns]] — The mechanisms that contain failures before they become incidents
- [[Observability and Alerting]] — Detection and diagnosis depend on observability
- [[Deployment and Release Engineering]] — Most incidents are caused by changes; fast rollback is the first mitigation

## Reflection Prompts

1. Your team averages 15 pages per on-call shift, with 80% being false alarms or alerts that auto-resolve within 5 minutes. Engineers are exhausted. How do you reduce page volume without missing real incidents?

2. A postmortem reveals that an outage was caused by a manual configuration change made by a senior engineer who bypassed the GitOps pipeline. The proposed action item is "remind engineers to use the pipeline." Is this a good action item? If not, what's better?

## Canonical Sources

- *Site Reliability Engineering* (Google SRE book) — Chapters 14–15 on incident management and postmortems
- *The SRE Workbook* (Google) — practical postmortem examples and on-call management
- PagerDuty Incident Response documentation (response.pagerduty.com) — open-source incident response guide
- Etsy's "Debriefing Facilitation Guide" — how to run blameless postmortem meetings