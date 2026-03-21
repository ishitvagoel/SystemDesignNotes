# Monolith vs Microservices

## Why This Exists

"Should we use microservices?" is the wrong first question. The right question is: "What problems do we have that microservices would solve, and are those problems worse than the problems microservices introduce?"

Microservices solve organizational scaling problems (many teams working on one codebase), deployment coupling (one team's deploy breaks another's), and technology heterogeneity (different services in different languages). They introduce distributed systems complexity (network failures, consistency challenges, operational overhead), deployment complexity (dozens of services to deploy, monitor, and debug), and data management challenges (no joins across services, distributed transactions).

Martin Fowler's "Monolith First" advice remains sound: start with a monolith, decompose when you have evidence of specific scaling problems that microservices solve.


## Mental Model

A monolith is a Swiss Army knife — every tool in one handle. Easy to carry, everything works together, and you only need to sharpen one blade. But if the corkscrew breaks, you can't use the knife while it's being repaired, and if you need a bigger screwdriver, you have to replace the whole knife. Microservices are a toolbox — each tool is separate. You can replace the hammer without touching the screwdriver, and different people can use different tools simultaneously. But now you need the toolbox itself (infrastructure), you lose tools between the cracks (network failures), and coordinating a task that needs three tools at once is harder than using one Swiss Army knife.

## The Decision Framework

**Start with a monolith when**:
- Team is small (<15 engineers). A monolith's simplicity outweighs microservices' coordination overhead.
- Domain is unclear. You don't know the right service boundaries yet. Getting boundaries wrong is worse than having no boundaries.
- Speed of iteration matters more than organizational scaling. Monoliths are faster to develop, deploy, and debug.
- You can't afford the operational overhead. Microservices require container orchestration, service discovery, distributed tracing, per-service CI/CD, and a team that understands distributed systems.

**Decompose to microservices when**:
- Multiple teams (3+) are stepping on each other in the same codebase. Merge conflicts, broken builds, and deploy queues indicate the monolith is a coordination bottleneck.
- Different parts of the system have different scaling needs. The checkout flow needs 10× the compute of the admin panel.
- Different parts need different deployment cadences. The recommendation engine deploys 5× daily; the billing system deploys monthly.
- You have the operational maturity to run distributed systems. This means: container orchestration (Kubernetes), observability (distributed tracing, centralized logging), and engineers who understand network failures, retry logic, and eventual consistency.

## The Modular Monolith: The Middle Path

A modular monolith is a single deployable unit with strong internal boundaries. Modules communicate through well-defined interfaces (not direct database access). Each module owns its data.

This gives you most of microservices' organizational benefits (team ownership, clear interfaces, independent development) without the distributed systems overhead (network calls become function calls, transactions are local, debugging is straightforward).

If you later need to extract a module into a separate service, the well-defined interface makes it a manageable migration. Shopify's architecture is the canonical example — they run a massive modular monolith that handles enormous scale.

**When the modular monolith isn't enough**: When you need independent deployment (different release cadences), independent scaling (different resource needs), or technology heterogeneity (different modules need different languages/runtimes).

## Trade-Off Analysis

| Architecture | Deployment Speed | Operational Cost | Team Autonomy | Debugging | Best For |
|-------------|-----------------|-----------------|---------------|-----------|----------|
| Monolith (well-structured) | Fast — single deploy | Low — one process, one database | Limited — shared codebase | Easy — single process, stack traces | Startups, small teams, early-stage products |
| Modular monolith | Fast — single deploy, module boundaries | Low | Moderate — module ownership | Easy — single process, clear boundaries | Growing teams, pre-microservice stage |
| Microservices | Per-service — independent deploys | High — many services, networking, observability | High — full ownership | Hard — distributed tracing, partial failures | Large organizations, independent team scaling |
| Serverless functions | Instant — per-function deploy | Variable — pay-per-invocation | High | Hard — cold starts, observability gaps | Event-driven workloads, glue code, variable traffic |

**The monolith is not the enemy**: Most failed microservice migrations happen because teams decomposed too early, before understanding their domain boundaries. A well-structured modular monolith with clear internal APIs gives you most of the organizational benefits of microservices (team ownership, clear boundaries) without the distributed systems tax (network failures, eventual consistency, deployment orchestration). Decompose when you have a clear organizational or scaling reason, not because it's fashionable.

## Failure Modes

- **Premature decomposition**: Splitting into microservices before understanding domain boundaries. Services are tightly coupled, requiring coordinated deploys, shared databases, and chatty inter-service communication. You've built a "distributed monolith" — all the complexity of both architectures.
- **Nano-services**: Decomposing too finely. Each service does one tiny thing. A single user action triggers 20 inter-service calls. Latency explodes, debugging is impossible, and operational overhead is enormous. Guidance: a service should be owned by one team and represent a meaningful business capability, not a single database table.
- **Shared database anti-pattern**: Multiple services read/write the same database tables. Schema changes require coordinating across services. Services are coupled through their data, not their interfaces. Each service should own its data store exclusively.

## Connections

- [[Service Decomposition and Bounded Contexts]] — How to find the right service boundaries
- [[Strangler Fig and Migration Patterns]] — How to migrate from monolith to services incrementally
- [[API Gateway Patterns]] — The external interface for a microservice architecture
- [[Cell-Based Architecture]] — A scaling pattern that works within both monoliths and microservices

## Reflection Prompts

1. A 50-person engineering team is running a monolith. Deployments take 2 hours (long test suite), and merge conflicts are frequent because 10 teams touch overlapping code. The CTO wants to move to microservices. Before decomposing, what organizational and technical prerequisites would you insist on having in place? What would make you recommend a modular monolith instead?

2. Your company decomposed a monolith into 30 microservices. Six months later, you discover that 80% of API calls are synchronous chains (A→B→C→D). A failure in service D cascades to A. Deployments still require coordination because services share a database. What went wrong with the decomposition, and how would you fix it without going back to a monolith?

3. A startup with 5 engineers and 1,000 users is debating microservices. The founders want "scalable architecture from day one." What would you tell them, and how would you design the monolith so that future decomposition is as easy as possible?

## Canonical Sources

- Fowler, "Monolith First" (blog post, 2015) — the argument for starting with a monolith
- *Building Microservices* by Sam Newman (2nd ed) — the comprehensive reference for microservice architecture decisions
- *A Philosophy of Software Design* by John Ousterhout — "deep modules" concept applies: services should be deep (rich functionality, simple interface), not shallow