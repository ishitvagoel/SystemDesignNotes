# Multi-Tenancy and Isolation

## Why This Exists

SaaS applications serve many customers (tenants) on shared infrastructure. The fundamental tension: sharing is cost-efficient (one Postgres instance serving 1,000 tenants costs far less than 1,000 separate instances), but tenants expect isolation — one tenant's traffic spike, runaway query, or data breach shouldn't affect another tenant. Every multi-tenant system makes an explicit trade-off on this spectrum.

## Mental Model

An apartment building. Tenants share the building's structure, plumbing, and electricity (shared infrastructure). But a noisy tenant on floor 3 keeps everyone awake (noisy neighbor). A tenant who leaves the water running floods the floor below (resource exhaustion). And a tenant who picks other tenants' locks accesses their apartments (data leakage). The building manager (your platform) must provide noise walls (resource isolation), flood barriers (quotas), and good locks (data isolation).

## The Isolation Spectrum

| Level | Compute | Database | Isolation Quality | Cost Efficiency | Operational Complexity |
|-------|---------|----------|------------------|----------------|----------------------|
| **Shared-everything** | Shared processes | Shared tables with `tenant_id` column | Lowest | Highest | Lowest |
| **Shared-infra, schema-per-tenant** | Shared processes | Separate Postgres schema per tenant | Medium | High | Medium |
| **Shared-infra, DB-per-tenant** | Shared processes | Separate database per tenant | High | Medium | Medium-high |
| **Dedicated infrastructure** | Dedicated instances | Dedicated databases | Highest | Lowest | Highest |

**Most SaaS products use shared-everything for free/small tiers and progressively isolated infrastructure for enterprise tiers.** This aligns cost with revenue — the highest-paying customers get the strongest isolation.

## The Noisy Neighbor Problem

In shared-everything, one tenant's behavior degrades others:

- **Expensive queries**: Tenant A runs a full table scan on a shared database. Every other tenant's queries slow down because they're competing for the same buffer pool and I/O bandwidth.
- **Traffic spikes**: Tenant B's marketing campaign drives 10× their normal traffic. Shared API servers hit CPU limits; all tenants experience increased latency.
- **Storage growth**: Tenant C uploads 500GB of attachments. Shared disk fills up; writes fail for everyone.

### Mitigation Strategies

**Per-tenant rate limiting** ([[Rate Limiting and Throttling]]): Each tenant gets a request quota (e.g., 1,000 req/min for free tier, 50,000 for enterprise). Requests exceeding the quota return 429. This prevents any single tenant from monopolizing shared compute.

**Resource quotas**: Limit CPU, memory, I/O, and connection pool usage per tenant. In Kubernetes, use ResourceQuotas per namespace (if tenants are in separate namespaces). In a database, use connection limits and statement timeouts per tenant role.

**Query timeouts and guardrails**: Kill queries exceeding a time limit (e.g., 30 seconds). Reject queries that would scan more than N rows without an index. These protect the shared database from accidental full-table scans.

**QoS tiers**: Separate shared resources into tiers. Enterprise tenants' requests go to a dedicated pool with higher capacity. Free-tier requests go to a shared pool that's throttled more aggressively. This is [[Cell-Based Architecture]] applied per tier.

## Data Isolation

At minimum, every query MUST filter by tenant. A bug that forgets `WHERE tenant_id = ?` exposes one tenant's data to another — a security breach.

**Application-level filtering**: Every repository/DAO method includes the tenant ID. Relies on developer discipline. A single missed filter is a breach. Fragile.

**Postgres Row-Level Security (RLS)**: The database enforces the filter. Even if application code forgets the WHERE clause, RLS prevents cross-tenant access:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

The application sets `app.tenant_id` at the beginning of each request. All queries on `orders` are automatically filtered. This is defense-in-depth — the application should still filter, but RLS is the safety net.

**Schema-per-tenant**: Each tenant gets a Postgres schema (`tenant_123.orders`). Physical separation — no possibility of cross-tenant data leakage. But managing 10,000 schemas is operationally painful (migrations run on each schema, connection routing complexity).

**Database-per-tenant**: The strongest relational isolation. Each tenant gets a separate database instance. Enables per-tenant backup/restore, independent scaling, and regulatory isolation (different regions per tenant). But operational overhead scales linearly with tenant count — at 1,000 tenants, you're managing 1,000 databases.

## Tenant-Level Monitoring

Global metrics hide per-tenant problems. A global p99 of 200ms might conceal one enterprise tenant experiencing 2,000ms latency because their data partition is on a hot shard.

**Per-tenant SLIs**: Track latency, error rate, and throughput per tenant. Alert when a tenant's SLI degrades relative to their tier's SLO.

**Per-tenant cost attribution**: Track compute, storage, and network consumption per tenant. This enables usage-based pricing and identifies tenants whose usage doesn't justify their plan. See [[Cost Engineering and FinOps]].

## Trade-Off Analysis

| Isolation Model | Resource Isolation | Data Isolation | Cost per Tenant | Operational Overhead | Best For |
|----------------|-------------------|---------------|----------------|---------------------|---------| 
| Shared everything (pool model) | None — noisy neighbor risk | Logical — row-level tenant ID | Lowest | Low — one deployment | SaaS with many small tenants, free tiers |
| Shared compute, separate databases | None for compute | Strong — database per tenant | Moderate | Medium — many databases | Mid-tier SaaS, compliance-sensitive tenants |
| Separate compute + database (silo) | Full | Full | Highest | High — per-tenant infrastructure | Enterprise tenants, regulated industries, government |
| Hybrid (pool + silo for premium) | Tiered | Tiered | Variable | Medium-High | SaaS with free + enterprise tiers |
| Cell-based (tenant groups in cells) | Cell-level | Cell-level | Moderate | Medium — cell management | Large-scale SaaS balancing isolation and efficiency |

**Start shared, silo on demand**: Building per-tenant infrastructure from day one is an operational nightmare with 1,000 tenants. Start with shared everything (tenant_id column on every table, row-level security). When a customer needs compliance isolation or pays for premium SLA, migrate them to a silo. This is easier than the reverse — going from silo to shared requires merging databases.

## Failure Modes

- **Cross-tenant data leak**: A code path missing the tenant filter. The most dangerous multi-tenancy bug. Prevention: RLS as a database-level safety net, automated testing that verifies every query includes tenant_id, and security audits focused on data isolation.

- **Tenant migration (re-sharding)**: A growing tenant outgrows its shared shard. Moving them to a dedicated shard or a higher tier requires migrating data while maintaining availability. This is a complex operation — plan for it from the start by using a routing layer that maps tenant_id → shard.

- **Schema migration across tenants**: In schema-per-tenant, a database migration runs 10,000 times (once per schema). If migration #5,000 fails, you have 5,000 tenants on the new schema and 5,000 on the old. Mitigation: idempotent migrations, per-tenant migration tracking, and the ability to skip/retry individual tenants.

## Connections

- [[Cell-Based Architecture]] — The strongest isolation: each cell serves a subset of tenants
- [[Rate Limiting and Throttling]] — Per-tenant rate limiting prevents noisy neighbors
- [[Partitioning and Sharding]] — Tenant-based partitioning is a natural sharding strategy
- [[Cost Engineering and FinOps]] — Per-tenant cost attribution enables pricing optimization
- [[Geo-Distribution and Data Sovereignty]] — Tenant location determines data residency requirements

## Reflection Prompts

1. You run a shared-everything SaaS with 500 tenants on one Postgres instance. A new enterprise customer requires dedicated infrastructure (regulatory requirement). How do you architect a system that supports both shared tenants and dedicated tenants with a single codebase?

2. Your RLS policy uses `current_setting('app.tenant_id')`. A developer accidentally calls a database function that resets the session, clearing the tenant_id setting. Subsequent queries execute without the RLS filter. How do you prevent this class of bug?

## Canonical Sources

- AWS SaaS Factory, "SaaS Tenant Isolation Strategies" — reference architectures for multi-tenant isolation on AWS
- *Building Microservices* by Sam Newman (2nd ed) — multi-tenancy patterns
- Postgres documentation, "Row Security Policies" — RLS implementation reference