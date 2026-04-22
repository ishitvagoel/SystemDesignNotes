# Feature Flags and Safe Deployment

## Why This Exists

Every deployment is a risk. The larger the change, the larger the blast radius when something goes wrong. Traditional deployment strategies (blue-green, canary) move entire deployments to new infrastructure. Feature flags decouple **deployment** (code going to production servers) from **release** (that code being activated for users). This separation is the most important concept in modern deployment safety.

With feature flags, you can deploy code to 100% of servers on Monday, activate it for 1% of users on Wednesday, ramp to 100% over two weeks — and roll back to 0% in under 30 seconds if a problem emerges. You can ship a half-finished feature to production without users ever seeing it, test it with internal employees first, then gradually expose it. This eliminates the "big bang" release that has caused countless production incidents.

## Mental Model

Think of feature flags as **circuit breakers for features**. Circuit breakers in electrical systems let you cut power to one part of the house without shutting everything down. Feature flags let you cut off one feature for one user segment without rolling back the entire deployment. A junior engineer can kill a bad feature before it escalates to an incident — no deployment pipeline required, no on-call wake-up needed.

The deeper insight: feature flags turn production into a laboratory. Every user sees a configuration of enabled features. By controlling which users see which features, you run controlled experiments on real production traffic without separate staging environments.

## Flag Types

Not all flags are the same. Using the wrong flag type leads to confusion and technical debt.

### Kill Switch (Ops Flag)
**Purpose**: Disable a code path that's causing problems in production.
**Lifetime**: Temporary — should be removed once the code path is stable or removed.
**Example**: `db_write_new_schema_enabled` — toggles between old and new database write path during a migration.
**Who controls**: On-call engineer during an incident. Should be "off = safe, on = new behavior."

### Release Flag (Graduated Rollout)
**Purpose**: Control the population of users who see a new feature.
**Lifetime**: Temporary — exists until the feature is fully rolled out or abandoned.
**Example**: `new_checkout_flow` → 0% → 5% → 25% → 100% over 2 weeks.
**Who controls**: Product manager or release engineer via a dashboard.

### Experiment Flag (A/B Test)
**Purpose**: Compare two variants of behavior to measure a business or performance outcome.
**Lifetime**: Time-boxed (1–4 weeks) — must have a pre-defined end date and success criterion.
**Example**: `checkout_cta_text` with variants "Buy Now" vs "Complete Purchase" — measuring conversion rate.
**Who controls**: Product/data team. Requires statistical significance before declaring a winner.

### Permission Flag (Entitlement)
**Purpose**: Enable features for specific users, plans, or organizations.
**Lifetime**: Long-lived — may be permanent business logic.
**Example**: `advanced_analytics_enabled` — only active for Enterprise tier customers.
**Who controls**: Entitlement system, automatically based on subscription data.

## Evaluation Architecture

### Client-Side vs Server-Side Evaluation

**Server-side evaluation**: The application server calls the flag service (or reads a cached config) to evaluate flags for each request. Flag logic lives centrally; clients just receive "flag X is on/off for this user."

**Pros**: Secure (flag targeting rules not exposed to users), consistent (all evaluations in one place), auditable.
**Cons**: Network call overhead (mitigated by local caching), flags can't control frontend behavior directly.

**Client-side evaluation**: The flag SDK runs in the browser/mobile app. The SDK downloads targeting rules and evaluates locally. Used for frontend-only flags (UI variants, feature visibility).

**Pros**: Zero latency (local evaluation), works offline.
**Cons**: Targeting rules visible to users (security risk for sensitive business logic), evaluation inconsistency between clients with stale configs.

**Best practice**: Use server-side evaluation for all business logic and A/B experiments. Use client-side only for pure UI/UX flags where the targeting logic isn't sensitive.

### Flag Evaluation Pipeline

```
Request → Extract context (user_id, org_id, region, plan)
       → Fetch flag config (local cache, refreshed every 30s)
       → Evaluate targeting rules (ordered: killswitch > permission > experiment > rollout)
       → Return boolean/variant
       → Log evaluation event (for audit trail and experiment analysis)
```

**Context is everything**: A flag evaluation is only as good as the context provided. `user_id` enables per-user consistency (a user sees the same variant across sessions). `org_id` enables account-level flags (turn on a feature for Acme Corp). `region` enables geo-targeting. `build_id` enables per-deployment flags.

### Flag Service Architecture

For a high-traffic system, flag evaluation must be extremely fast (< 1ms) and highly available:

1. **Flag definitions** stored in a database (PostgreSQL, DynamoDB) — the source of truth.
2. **Flag configs** pushed to a pub/sub system (Kafka, Redis Pub/Sub) on every change.
3. **Local cache** in each service instance — holds all flag configs in memory. Refreshed via push (instant) or pull (every 30s).
4. **Evaluation** happens entirely in memory — no network call at request time.
5. **Evaluation events** asynchronously logged (Kafka → data warehouse) for experiment analysis.

**Availability**: If the flag service goes down, services use their cached configs — stale but functional. This is intentional. Flags must degrade gracefully; they cannot be a single point of failure.

## Trade-Off Analysis

| Approach | Evaluation Speed | Consistency | Security | Complexity |
|----------|-----------------|-------------|----------|------------|
| **Server-side + local cache** | <1ms | High (cache refresh) | High | Medium |
| **Server-side + real-time call** | 5–50ms | Perfect | High | Low |
| **Client-side SDK** | <0.1ms | Medium (stale config) | Low | Low |
| **Database query per request** | 10–100ms | Perfect | High | Low |

## Stale Flag Cleanup

The Knight Capital disaster ($440M loss in 45 minutes) happened partly because an old code path was reactivated by a flag that should have been deleted years earlier. Flag hygiene is not optional.

**Flag lifecycle rules**:
1. Every flag has an owner and a planned removal date set at creation.
2. After a feature is 100% rolled out and stable for 30 days, the flag is "ready for removal" — the code branch behind the flag becomes permanent, the flag config is deleted.
3. Experiment flags have a hard expiry — they are automatically disabled after the experiment end date.
4. A lint check in CI flags (pun intended) any flag in code that doesn't exist in the flag registry (dead reference).
5. Monthly review: flags with no evaluation events in 30 days are candidates for removal.

**Technical debt**: An unremoved release flag that evaluates to `true` 100% of the time is dead code bloat. After 6 months, nobody knows what happens if it's toggled off. Remove flags within 1 sprint of reaching 100% rollout.

## Failure Modes & Production Lessons

**1. Flag evaluation becomes a hot path bottleneck**
At 50,000 RPS, even a 2ms flag evaluation call adds 100 seconds of aggregate latency per second of traffic. Mitigation: always use local in-memory caching; never make a network call per request for flag evaluation.

**2. Flag targeting rule inconsistency (user sees two variants)**
A user clears their cookies, gets a new anonymous ID, and sees a different A/B variant than before. This introduces bias in experiment data and degrades UX. Mitigation: tie experiment assignment to stable identity (logged-in user ID, not session); use sticky bucketing (store assignment in user profile on first evaluation).

**3. Combinatorial flag interaction bug**
With 50 flags enabled simultaneously, unexpected interactions emerge. Flag A changes the payment flow; Flag B changes cart validation; together, they produce an uncovered code path that crashes. Mitigation: limit simultaneous experiments in the same feature area; add integration tests for common flag combinations; monitor error rates by flag combination in observability.

**4. Flag-in-flag dependency**
Engineer writes: `if (flagA && flagB) { ... }`. Now FlagA and FlagB are coupled — turning off FlagA has invisible effects on FlagB behavior. Mitigation: flags should control exactly one behavior; dependencies between flags are a design smell — refactor to a single flag with multiple variants.

**5. Missing evaluation logging**
Experiment data is invalid because evaluation events weren't logged for 20% of evaluations (SDK version mismatch dropped events). Mitigation: treat evaluation logging as critical path; alert if evaluation log volume drops unexpectedly relative to request volume.

## Architecture Diagram

```mermaid
flowchart TD
    Request["Incoming Request\n(user_id: 12345, plan: pro)"] --> AppSvc["Application Service"]

    AppSvc --> Cache["Local Flag Cache\n(in-memory, refreshed 30s)"]
    Cache --> Eval{{"Flag Evaluation\nEngine"}}

    Eval --> |"new_dashboard: OFF\n(user 12345 → 0% rollout)"| PathA["Old Dashboard Path"]
    Eval --> |"advanced_export: ON\n(plan: pro)"| PathB["Export Feature"]
    Eval --> |"dark_mode_v2: ON\n(experiment: variant B)"| PathC["Dark Mode V2"]

    AppSvc --> |"async"| EventLog["Evaluation Event Log\n(Kafka)"]

    subgraph FlagControl ["Flag Control Plane"]
        FlagDB[("Flag Definitions\n(PostgreSQL)")] --> Pub["Config Publisher\n(on change)"]
        Pub --> |"push update"| Cache
    end

    EventLog --> DW["Data Warehouse\n(experiment analysis)"]

    style FlagControl fill:var(--surface),stroke:var(--accent),stroke-width:2px
    style Eval fill:var(--surface),stroke:var(--accent2),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **Flag evaluation latency**: < 0.1ms with local in-memory cache; 5–50ms with remote call. Use local cache always.
- **Cache size**: 500 flags × 2 KB average config = 1 MB in memory — negligible even on the smallest service instances.
- **Evaluation event volume**: At 10,000 RPS with 5 flags evaluated per request = 50,000 events/second. At 100 bytes/event: 5 MB/s to Kafka — easily handled.
- **Flag count rule of thumb**: > 100 active flags is a warning sign of poor hygiene. > 500 flags indicates systemic technical debt. Aim to keep active (non-permanent) flags < 50 at any time.
- **Rollout math**: To detect a 0.5% increase in error rate with 95% confidence and 80% power, you need ~60,000 users per variant. At 10,000 DAU, that's 6 days minimum. Don't rush experiment conclusions.
- **Rollback speed**: A flag toggle takes < 30 seconds to propagate with push-based config. A deployment rollback takes 5–15 minutes. Flags are 10–30× faster for incident mitigation.

## Real-World Case Studies

- **GitHub (Flipper)**: GitHub uses an open-source Ruby gem called Flipper to manage thousands of feature flags. During the GitHub Actions launch, they used Flipper to first enable the feature for GitHub employees ("actors"), then specific early-access organizations, then progressively rolled out to all users over 6 weeks — each stage gate requiring a manual approval. This allowed them to fix infrastructure scaling issues discovered at 1% rollout before exposing the feature to 100 million repositories.

- **Linear (Feature Gating)**: Linear, a project management tool, uses feature flags to power their tiered pricing model. When a user upgrades from the free to Pro plan, a single flag evaluation context change instantly unlocks 15+ features — no code deployment, no cache flush. The flag service is the runtime representation of their entitlement model, making plan changes instantaneous and auditable.

- **Stripe (Scientist)**: Stripe uses a pattern called "Scientist" (open-sourced by GitHub) alongside feature flags. When migrating critical payment processing logic, they run both old and new code paths for 100% of requests but only return the old result. The new path's result is compared silently — if they match, confidence grows; if they diverge, engineers investigate. Flags control when this dual-run mode is active per endpoint.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Deployment_and_Release_Engineering]] — Feature flags are the "release" half of the deploy-vs-release separation
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Circuit_Breakers_and_Bulkheads]] — Kill-switch flags and circuit breakers serve the same purpose (fast path disablement) at different granularities
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — Flag evaluation events feed into experiment analysis and error rate monitoring per variant
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Distributed_Tracing_Deep_Dive]] — Flag assignment should be captured as span attributes for debugging variant-specific latency

## Reflection Prompts

1. Your team has accumulated 300 feature flags. You have no ownership tracking, no planned removal dates, and half the flags haven't been evaluated in 6 months. Design a cleanup process: how do you prioritize which flags to remove first, how do you safely remove a flag that's been "true" for 2 years, and what process changes prevent this accumulation from happening again?

2. You're running an A/B experiment: Flag A = "old checkout button" (blue), Flag B = "new checkout button" (green). After 3 days, the new variant shows +2% conversion — but your data scientist says "the result isn't statistically significant yet." The product manager wants to ship immediately. Walk through the risks of ending the experiment early and explain the concept of statistical significance in terms a product manager would find compelling.

3. A microservice runs 10 feature flags. You're adding a kill switch for a new database migration path. What happens if the flag service is unavailable when the kill switch needs to be triggered? Design the flag evaluation fallback behavior for: (a) a kill switch, (b) a release flag at 50% rollout, (c) an experiment flag.

## Canonical Sources

- Pete Hodgson, "Feature Toggles (aka Feature Flags)" — martinfowler.com (the canonical reference article)
- LaunchDarkly Engineering Blog — architecture deep dives on flag evaluation and SDKs
- OpenFeature specification (openfeature.dev) — vendor-neutral feature flag SDK standard
- GitHub, "Flipper" (github.com/flippercloud/flipper) — open-source reference implementation
- Knight Capital post-mortem (SEC filing, 2013) — cautionary tale of flag mismanagement
