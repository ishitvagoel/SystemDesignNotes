# Capstone — Feature Flag Platform

## Problem Statement

Design a feature flag platform used by 10,000 engineers to control feature rollouts, A/B experiments, and kill switches across a multi-service production system.

**Functional requirements**:
- Create, update, and delete flags with targeting rules (user %, user ID list, org ID, plan tier, region)
- Evaluate flags at request time with < 1ms p99 latency
- Support 4 flag types: kill switch, release flag (graduated rollout), experiment (A/B), permission flag
- Provide an A/B experiment analytics pipeline (evaluation events → statistical results)
- SDK support for server-side evaluation (Go, Python, Java) and client-side evaluation (browser, mobile)

**Non-functional requirements**:
- 50,000 flag evaluations/second (sustained); 200,000/second burst
- 99.99% availability for flag evaluation (flag service outage cannot block user traffic)
- Audit trail: every flag change logged with who changed it and when
- Flag change propagation to all SDKs in < 30 seconds

---

## Scale Estimation

**Traffic**:
- 50,000 RPS × 5 flags evaluated/request = 250,000 evaluations/second
- Each evaluation event: ~200 bytes → 50 MB/s to event pipeline (Kafka)
- 500 active flags × 2 KB config each = 1 MB total in-memory per SDK instance

**Data**:
- Flag configs: 500 flags × 2 KB = 1 MB (tiny; entire config fits in RAM)
- Evaluation events: 250,000/s × 200 bytes = 50 MB/s → 4.3 TB/day (stream to cold storage, query aggregated)
- Audit log: ~10 flag changes/hour × 500 bytes = 5 KB/hour (negligible)

**Takeaway**: This is a read-heavy, latency-critical system where the entire working set fits in RAM. Evaluation must never make a network call at request time.

---

## High-Level Design

```mermaid
flowchart TD
    subgraph ControlPlane["Control Plane (low-traffic, admin)"]
        FlagAPI["Flag Management API\n(REST, auth-gated)"]
        FlagDB[("Flag Config Store\n(PostgreSQL)")]
        AuditLog[("Audit Log\n(append-only)")]
        FlagAPI --> FlagDB & AuditLog
    end

    subgraph DataPlane["Data Plane (high-traffic, evaluation)"]
        SDK["SDK Local Cache\n(in-memory, per service instance)"]
        Eval["Evaluation Engine\n(in-process library)"]
        EventBuffer["Event Buffer\n(async, in-process)"]
    end

    subgraph Analytics["Analytics Pipeline"]
        Kafka["Kafka\n(evaluation events)"]
        Flink["Flink / Spark\n(experiment aggregation)"]
        ExperimentDB[("Experiment Results\n(ClickHouse)")]
        Dashboard["Stats Dashboard\n(p-values, confidence intervals)"]
    end

    FlagDB -->|"push on change\n(Postgres NOTIFY / CDC)"| Kafka
    Kafka -->|"fanout to SDKs\n(< 5s propagation)"| SDK
    SDK --> Eval
    Eval -->|"async write"| EventBuffer
    EventBuffer --> Kafka
    Kafka --> Flink --> ExperimentDB --> Dashboard

    style ControlPlane fill:var(--surface),stroke:var(--accent),stroke-width:2px
    style DataPlane fill:var(--surface),stroke:var(--accent2),stroke-width:2px
    style Analytics fill:var(--surface),stroke:#888,stroke-width:1px
```

---

## Deep Dive: Flag Evaluation Pipeline

**Context extraction**: Every evaluation receives a context object:
```
{ user_id, org_id, plan, region, app_version, custom_attrs }
```

**Targeting rule evaluation** (ordered priority):
1. **Kill switch** (global on/off, no targeting): always evaluated first; overrides all other rules
2. **Permission flag** (entitlement by org/plan): if user matches, return the permitted variant
3. **Experiment** (A/B assignment): deterministic bucket assignment via consistent hash on `user_id`
4. **Release rollout** (percentage): deterministic bucket on `user_id` — same user always gets the same variant

**Consistent bucketing** (preventing variant flip on re-evaluation):
```
bucket = murmurhash(flag_id + user_id) % 10000
# bucket 0–999 = variant A (10%), 1000–9999 = variant B (90%)
```
This is deterministic: the same `flag_id + user_id` always maps to the same bucket, regardless of when or where it's evaluated. A user sees the same variant across sessions, devices, and server instances.

**Evaluation output**: `{ flag_id, variant, reason, evaluated_at }`

**Evaluation event** (emitted async, never on the critical path):
```json
{
  "flag_id": "new_checkout_flow",
  "user_id": "u_12345",
  "variant": "treatment",
  "reason": "rollout_percentage",
  "timestamp": "2026-03-27T10:00:00Z",
  "sdk_version": "2.1.3"
}
```

---

## Deep Dive: SDK Design

The SDK is the critical path. Every design decision is subordinate to: **evaluation must never make a network call**.

**Bootstrap**: On startup, the SDK makes one HTTP call to fetch all flag configs (1 MB payload, < 100ms). It stores the config in memory and starts serving evaluations immediately.

**Config refresh — push model (preferred)**:
1. Flag config store (PostgreSQL) publishes a change event on every flag mutation via `NOTIFY` / CDC → Kafka
2. Each SDK instance subscribes to a Kafka consumer group (or Server-Sent Events endpoint)
3. On receipt of a change event, the SDK updates its in-memory cache — usually within 1–5 seconds of the flag change

**Config refresh — pull model (fallback)**:
- SDK polls the flag config endpoint every 30 seconds
- Used when long-lived Kafka connections are not feasible (browser, mobile)
- Worst-case propagation: 30 seconds

**Degraded state** (flag service unavailable):
- SDK continues using its in-memory cache (stale but functional)
- Kill switches that were ON remain ON; rollout percentages stay at their last-known value
- This is intentional: the flag service is never a single point of failure

**Client-side SDK (browser)**:
- Targeting rules must be downloadable for local evaluation
- **Security constraint**: rules must not expose business-sensitive logic (e.g., "enable for enterprise customers") — only safe targeting rules (region, A/B buckets) are exported to client-side SDKs
- Sensitive targeting (plan tier, org entitlements) is evaluated server-side only; client receives evaluated results, not rules

---

## Deep Dive: A/B Experiment Analytics

**Problem**: Naively reading "variant A had 1,000 conversions, variant B had 1,100 conversions" is misleading if the sample sizes are small or traffic was unequally distributed.

**Pipeline**:
1. Evaluation events → Kafka → Flink streaming job
2. Flink aggregates: per `(flag_id, variant)`: unique users, conversion events, conversion rate
3. Every hour: run Welch's t-test or chi-squared test on the aggregated data
4. Emit `{ flag_id, variant_a_rate, variant_b_rate, p_value, confidence_interval, is_significant }`
5. Dashboard displays results with a "significant at p < 0.05" badge

**Minimum detectable effect (MDE)**: Show engineers the sample size required before they start an experiment. For a 2% baseline conversion rate, detecting a 0.5% uplift at 95% confidence and 80% power requires ~60,000 users per variant. With 10,000 DAU, that's 6 days minimum.

**Guardrails**:
- Disable "declare winner" button until statistical significance is reached
- Log and alert on experiment duration > 4 weeks (results become unreliable due to novelty effects, seasonal bias)
- Flag experiments with imbalanced assignment (> 5% deviation from intended split — indicates a bucketing bug)

---

## Deep Dive: Stale Flag Cleanup

The Knight Capital disaster ($440M in 45 minutes) was partly caused by an old code path reactivated by a flag that should have been deleted years earlier.

**Automated lifecycle**:
1. At flag creation: set `owner`, `type`, and `planned_removal_date`
2. Release flags at 100% rollout for 30+ days: CI lint check flags the dead branch — a PR cannot merge with code referencing a flag that's been 100% for 30 days without removing the code path and the flag config
3. Experiment flags: hard expiry after the experiment end date — auto-disabled by a scheduled job
4. Monthly report: flags with zero evaluation events in 30 days are flagged for review

**Safe removal procedure** for a flag that's been `true` for 2 years:
1. Verify 100% rollout and no change in 30+ days via the analytics dashboard
2. Search codebase for all references to the flag key — review each code path with the owning team
3. Add a "shadow mode" for 1 week: flag stays 100% but emits a warning log on evaluation (regression detection)
4. Remove the flag config; deploy the code with the dead branch removed
5. Monitor error rates for 48 hours post-deployment

---

## Trade-Off Analysis

| Approach | Eval Latency | Propagation | Security | Complexity |
|----------|-------------|-------------|----------|------------|
| **In-memory cache + push** | < 0.1ms | 1–5s | High | Medium |
| **In-memory cache + pull (30s)** | < 0.1ms | ≤ 30s | High | Low |
| **Remote call per evaluation** | 5–50ms | Instant | High | Low |
| **Client-side evaluation** | < 0.01ms | ≤ 30s | Low | Low |

**Recommendation**: In-memory cache with push-based config update for all server-side SDKs. Client-side evaluation only for non-sensitive UI flags (layout variants, theme, non-entitlement features).

---

## Failure Modes

**Flag service outage**: SDKs use stale in-memory cache. Production continues unaffected. Kill switches cannot be toggled during the outage — design kill switch flags to default to the safe state so they can be hard-coded as a fallback.

**Kafka consumer lag**: Config push events are delayed. SDKs fall back to pull (30s refresh). Propagation degrades from 5s to 30s. Alert when Kafka consumer lag > 1 minute.

**Cardinality explosion in experiment analysis**: If `user_id` is used as a targeting dimension in Kafka event keys, the partition key space grows unbounded. Use `flag_id` as the Kafka partition key — bounded by the number of active flags.

**Combinatorial flag interactions**: With 50 active flags, some combination of N flags creates an untested code path. Mitigation: limit simultaneous experiments in overlapping feature areas; monitor error rates broken down by flag combination hash in observability.

---

## Connections

- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Feature_Flags_and_Safe_Deployment]] — Core patterns for flag types, evaluation semantics, and stale flag cleanup
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Deployment_and_Release_Engineering]] — Feature flags are the "release" half of the deploy-vs-release separation; this capstone designs the platform that enables that
- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Message_Queues_vs_Event_Streams]] — Evaluation event pipeline and config change propagation via Kafka
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — Evaluation events feed experiment analysis; error rates per variant are a key SLI
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__SLOs_SLIs_and_Error_Budgets]] — 99.99% availability SLO for the flag evaluation path; propagation latency as an SLI


## Why This Exists

A feature flag platform at scale requires serving rule evaluations with extreme low latency (<1ms) across thousands of applications. This capstone tests your ability to design highly available, read-heavy, geo-distributed systems with minimal staleness.

## Reflection Prompts

1. How do you propagate a feature flag toggle from the management dashboard to 10,000 application servers in under 5 seconds?
2. What is the impact on your target applications if the feature flag evaluation service goes down completely?
