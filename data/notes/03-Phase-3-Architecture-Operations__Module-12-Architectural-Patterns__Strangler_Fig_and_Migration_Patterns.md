# Strangler Fig and Migration Patterns

## Why This Exists

Big-bang rewrites fail. A two-year rewrite that tries to replace the entire monolith at once is one of the highest-risk engineering endeavors. During those two years, the old system keeps changing (business doesn't wait), the new system's requirements drift, and the "switchover day" becomes a terrifying all-or-nothing event.

The strangler fig pattern (named by Martin Fowler after the strangler fig tree that gradually grows around and replaces its host tree) provides an alternative: **incrementally replace the old system piece by piece**, routing traffic to the new implementation as each piece is ready. At any point, the system is a working hybrid of old and new. Eventually, the old system withers away.


## Mental Model

Named after the strangler fig tree in tropical forests. The fig seed lands in the canopy of an existing tree and grows roots downward, slowly wrapping around the host tree. Over years, the fig's roots reach the ground and thicken, eventually replacing the host tree entirely — while the host continues living throughout the process. In software migration, the "host tree" is your legacy system. You don't chop it down and plant a new one (big-bang rewrite). Instead, you grow the new system around it — routing new features to the new system, migrating existing features one by one — until the legacy system has no traffic left and can be safely removed. The key insight: at every point during the migration, the system is fully functional.

## The Strangler Fig Pattern

### How It Works

1. **Intercept**: Place a routing layer (API gateway, proxy, load balancer) in front of the monolith.
2. **Implement**: Build the new service for one bounded context.
3. **Route**: Configure the routing layer to send traffic for that context to the new service. Everything else still goes to the monolith.
4. **Verify**: Monitor the new service. Compare outputs with the monolith (shadow traffic, parallel runs).
5. **Repeat**: Pick the next context. Implement, route, verify.

The routing layer is the key — it allows old and new to coexist at the same URL, transparent to clients.

### Data Migration

The trickiest part: the monolith's database contains data for all contexts. Extracting a service means migrating its data to the new service's database while keeping both systems consistent during the transition.

**Approaches**:
- **Database-first**: Migrate the data first. Both old and new code read from the new database (via a compatibility layer). Then migrate the code.
- **Code-first**: Deploy the new service with a new database. Sync data from the monolith's database via CDC or ETL. Run both in parallel until the new service is verified.
- **Event-driven**: The monolith publishes events for the migrated domain. The new service consumes events and builds its own data store. This naturally decouples data ownership.

## Supporting Patterns

### Sidecar Pattern

Deploy a helper container alongside the main application container (in the same pod in Kubernetes). The sidecar handles cross-cutting concerns: logging, monitoring, mTLS, retries, circuit breaking. The main container is unaware of the sidecar.

**Use case**: Adding observability or security to a legacy service without modifying its code. Envoy as a sidecar proxy handles mTLS and load balancing for the service.

### Service Mesh

A fleet of sidecar proxies (one per service instance) managed by a control plane. The data plane (sidecars) handles service-to-service communication. The control plane (Istio, Linkerd) configures routing, policies, and observability.

**What it provides**: mTLS everywhere (zero-trust networking), traffic management (canary routing, fault injection), observability (distributed tracing without code changes), and retries/circuit breaking.

**When it's worth it**: When you have 20+ services and need consistent cross-cutting policies. For 5 services, a service mesh is overkill — use a library (resilience4j, Polly) instead.

### Ambassador Pattern

A sidecar that acts as an outbound proxy for the main container. The application sends all external calls through the ambassador, which handles retries, circuit breaking, and connection pooling. Useful when you can't modify the application's HTTP client behavior.

## Trade-Off Analysis

| Migration Pattern | Risk | Duration | Rollback Complexity | Best For |
|------------------|------|----------|--------------------|---------| 
| Strangler fig (incremental replacement) | Low — old system is fallback | Months to years | Easy — route back to old system | Large monolith decomposition, legacy replacement |
| Big bang rewrite | Very high — no fallback | Months | Impossible — old system decommissioned | Only when old system is truly unmaintainable |
| Branch by abstraction | Low — abstraction layer isolates changes | Weeks to months per feature | Easy — switch abstraction impl | Internal component replacement within a codebase |
| Parallel run (dark launch) | Low — compare outputs, don't serve new | Weeks per feature | Trivial — just stop comparing | Critical path changes, data pipeline migrations |
| Blue-green migration | Low — instant cutover with rollback | Days | Easy — switch back to blue | Infrastructure migrations, database version upgrades |

**Why strangler fig is almost always the right choice**: Big bang rewrites fail because they require understanding and reimplementing the entire old system before delivering any value. The strangler fig delivers value incrementally — each migrated feature goes live independently. The old system shrinks over time. The only exception is when the old system is so fragile that running it alongside new code is itself a risk (e.g., the system crashes under any change).

## Failure Modes

**Strangler proxy becomes a bottleneck**: All traffic flows through the strangler proxy (routing between old and new systems). The proxy adds latency to every request, and if it fails, both old and new systems become unreachable. Solution: keep the proxy stateless and horizontally scalable, use an existing load balancer or API gateway as the proxy, and eliminate the proxy once migration is complete.

**Feature parity treadmill**: The new system is always catching up with features being added to the old system. Business keeps adding features to the old system because "the new one isn't ready yet." The migration never finishes. Solution: freeze new feature development on the old system (or redirect it to the new system), set a hard deadline for migration, and accept that some rarely-used features may be dropped.

**Data inconsistency during dual operation**: During migration, both systems operate simultaneously. Data written to the new system isn't visible in the old system and vice versa. Users see inconsistent data depending on which system serves their request. Solution: dual-write to both systems during the transition, or use CDC to keep both systems in sync. Verify consistency with shadow reads.

**Rollback complexity after partial migration**: 40% of features are migrated to the new system. A critical bug is discovered. Rolling back to the old system requires re-routing traffic AND migrating data changes back — but the old system's schema may not accommodate new data structures. Solution: maintain rollback capability at each migration step. Don't decommission old system functionality until the new equivalent is proven in production for a sufficient burn-in period.

**Underestimating legacy system complexity**: The old system has undocumented behaviors, implicit business rules in stored procedures, and edge cases that nobody remembers. The new system reproduces the documented 80% of behavior but misses the critical 20%. Solution: parallel run (shadow mode) that compares outputs of both systems before routing real traffic, comprehensive integration tests derived from production traffic, and involve people who built the old system.

## Connections

- [[Monolith vs Microservices]] — The strangler fig is the migration path from monolith to microservices
- [[Service Decomposition and Bounded Contexts]] — Each strangler fig iteration extracts one bounded context
- [[API Gateway Patterns]] — The gateway serves as the routing layer for the strangler fig

## Reflection Prompts

1. You're strangler-fig migrating a monolith's user authentication. The new auth service is deployed and handling 10% of traffic. A security vulnerability is discovered in the new service. You need to route 100% of auth traffic back to the old system immediately. What infrastructure do you need to have in place for this to take seconds instead of hours?

2. Your legacy system has a critical stored procedure that implements complex pricing logic accumulated over 8 years. Nobody fully understands it. You need to migrate this to the new system. How would you use the parallel run (dark launch) pattern to validate that your new implementation matches the old one, and what's your acceptance criteria for switching over?

3. A strangler fig migration has been running for 18 months. 70% of features are migrated. The remaining 30% are the hardest — deeply intertwined legacy features that depend on each other. The business is losing patience and wants to "just finish the migration." What are the risks of rushing the final 30%, and how would you make the case for maintaining the incremental approach?

## Canonical Sources

- Fowler, "Strangler Fig Application" (blog post, 2004) — the original pattern description
- *Building Microservices* by Sam Newman (2nd ed) — Chapter 3 covers migration patterns in detail
- *Designing Distributed Systems* by Brendan Burns (2nd ed, 2024) — covers sidecar, ambassador, and adapter patterns