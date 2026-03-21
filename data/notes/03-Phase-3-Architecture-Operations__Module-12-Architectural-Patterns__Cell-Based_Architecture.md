# Cell-Based Architecture

## Why This Exists

In a traditional architecture, a bug, a bad deploy, or a configuration error affects *all* users simultaneously. A single faulty deployment takes down the entire service. Cell-based architecture limits the **blast radius** by partitioning the system into independent, isolated units — cells — each serving a subset of users.

If cell 3 has a bad deploy, only the ~5% of users assigned to cell 3 are affected. The other 95% are completely unaffected. This is the architectural equivalent of watertight compartments on a ship.

This pattern has been adopted by Amazon (the original cell architecture), Slack, DoorDash, and an increasing number of companies operating at scale. It's an emerging pattern that deserves dedicated coverage because it fundamentally changes how you think about blast radius, deployment, and scaling.


## Mental Model

Watertight compartments on a ship. A traditional ship hull is one big open space — a single breach floods the entire ship (one bad deploy takes down everything). Cell-based architecture divides the hull into sealed compartments. A breach in compartment 3 floods only compartment 3 — the other 19 compartments are completely dry. In software, each cell is a complete, independent copy of the service stack (its own compute, database, cache, queue). A bad deploy, a database failure, or a traffic spike in one cell cannot affect any other cell. You sacrifice some efficiency (duplicated infrastructure) for radical blast radius isolation.

## How It Works

**Each cell is a complete, independent copy of the service stack** — its own compute, its own database, its own cache, its own queue. Cells share nothing except the routing layer that directs traffic.

```
                    ┌──────────────┐
     Traffic ──────►│  Cell Router  │
                    └──────┬───────┘
                    ┌──────┼───────┐
                    ▼      ▼       ▼
                 ┌─────┐┌─────┐┌─────┐
                 │Cell1││Cell2││Cell3│
                 │ API ││ API ││ API │
                 │ DB  ││ DB  ││ DB  │
                 │Cache││Cache││Cache│
                 └─────┘└─────┘└─────┘
```

**Cell routing**: A routing layer (typically at the API gateway or load balancer level) maps each request to a cell based on a partition key (user ID, tenant ID, organization ID). The routing is deterministic — the same user always goes to the same cell.

**Cell sizing**: Each cell serves a fixed maximum number of users or a fixed percentage of traffic. When capacity is needed, you add a new cell. Cells don't grow individually; you scale by adding cells.

### Blast Radius Isolation

**Deployment isolation**: Cells are deployed independently. A canary deploy goes to one cell first. If it breaks that cell, 95% of users are unaffected. Traditional canary deploys route a percentage of traffic to new code — but that traffic spans all infrastructure. Cell-based deployment isolates the blast radius to the cell's infrastructure.

**Failure isolation**: A database failure in cell 3 doesn't affect cell 1's database. A memory leak in cell 2's application doesn't affect cell 4's application. Failures are contained within cell boundaries.

**Configuration isolation**: A bad configuration change (wrong feature flag, incorrect rate limit) can be rolled out cell-by-cell. If cell 1 breaks, pause the rollout. Other cells are untouched.

### Shuffle Sharding

A refinement: instead of assigning each user to exactly one cell, assign each user to a random subset of cells (e.g., 2 of 20). If a cell fails, the affected users' other assigned cell takes over. The probability that two users share both cells is low — so a failure affecting one user's cells is unlikely to affect another user's cells.

Amazon uses shuffle sharding extensively in Route 53 and other services. With 2,000 cells and 2-cell assignment, the probability of two users sharing both cells is ~1 in 2 million.

## Trade-Off Analysis

| Dimension | Benefit | Cost |
|-----------|---------|------|
| Blast radius | Failures affect a fraction of users | More infrastructure (N copies of everything) |
| Deployment safety | Per-cell canary, rollback one cell | More complex deployment pipeline |
| Scaling | Add cells, don't resize existing ones | Each cell has minimum overhead (small cell = wasted resources) |
| Cross-cell operations | Each cell is simple (single-tenant-like) | Cross-cell queries require scatter-gather or a separate analytics path |
| Operational complexity | Each cell is independently operable | N cells = N×monitoring, N×alerting configs (must automate) |

## Failure Modes

**Cell routing misroute**: The cell router sends a request to the wrong cell (stale routing table, hash collision, misconfigured mapping). The wrong cell either returns errors (user not found) or, worse, returns a different user's data. Solution: cells must validate that the incoming request belongs to them (check tenant/user ID against cell assignment), and return a redirect or error if misrouted.

**Cell-wide failure blast radius**: A cell is supposed to limit blast radius, but a shared dependency (a global configuration service, a shared DNS resolver, a centralized auth service) fails, taking down all cells simultaneously. The cell architecture provides no isolation because the failure point is outside the cell boundary. Solution: minimize cross-cell dependencies, replicate shared services into each cell, and regularly audit the true blast radius with chaos engineering.

**Cell capacity imbalance**: Some cells are assigned high-traffic tenants and become overloaded while other cells are underutilized. Cell sizing was based on tenant count, not traffic volume. Solution: assign tenants to cells based on traffic volume (not just count), implement inter-cell migration for rebalancing, and over-provision each cell to handle traffic spikes.

**Cell migration data loss**: Moving a tenant from cell A to cell B requires migrating their data. During migration, writes to cell A must be captured and replayed to cell B. If the cutover happens before all writes are replayed, the tenant sees stale or missing data in cell B. Solution: use dual-write or CDC during migration, verify data consistency before cutover, and implement a rollback mechanism.

**Cross-cell operation complexity**: A feature requires aggregating data across all cells (global search, admin dashboard, analytics). Each cell must be queried individually, results merged. One slow cell delays the entire operation. Solution: maintain a read-only aggregated view outside the cell boundary (fed by CDC from each cell), implement timeouts per cell with partial results, and design features to work within a single cell whenever possible.

## Connections

- [[Partitioning and Sharding]] — Cell architecture is sharding at the infrastructure level, not just the data level
- [[Multi-Tenancy and Isolation]] — Cells provide the strongest form of tenant isolation
- [[Resilience Patterns]] — Cell architecture is a blast-radius control mechanism
- [[Monolith vs Microservices]] — Cell architecture is orthogonal to service decomposition; you can cell-partition a monolith or a microservice architecture

## Reflection Prompts

1. You're designing a SaaS platform for 10,000 tenants. You decide on cell-based architecture with 50 cells (200 tenants per cell). A major outage in one cell affects 200 tenants — 2% of your customer base. Your largest customer demands guaranteed isolation from other tenants. How do you handle this without giving every enterprise customer their own cell?

2. A cell-based system needs to implement a global search feature that spans all cells. Each cell has its own database and search index. A user query needs results from their cell plus global content. How would you architect this without creating a single point of failure that undermines the cell isolation model?

3. Your cell router uses a consistent hash of tenant_id to assign tenants to cells. You need to add 10 new cells to handle growth. This would redistribute tenants across cells, requiring data migration. How would you execute this expansion without downtime and without losing the isolation guarantees during migration?

## Canonical Sources

- AWS Well-Architected, "Cell-Based Architecture" whitepaper — Amazon's reference for the pattern
- Slack Engineering Blog, "Scaling Slack's Infrastructure with Cell-Based Architecture" — practical implementation at Slack
- DoorDash Engineering Blog on cell-based routing — DoorDash's adoption of the pattern
- Colm MacCárthaigh (AWS), various talks on shuffle sharding and cell isolation