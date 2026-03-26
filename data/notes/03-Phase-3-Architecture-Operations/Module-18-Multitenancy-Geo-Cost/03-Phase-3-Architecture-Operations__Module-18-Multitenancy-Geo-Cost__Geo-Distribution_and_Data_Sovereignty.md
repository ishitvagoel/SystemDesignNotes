# Geo-Distribution and Data Sovereignty

## Why This Exists

Users are global — a user in Tokyo and a user in Frankfurt both expect sub-100ms latency. Regulations are regional — GDPR requires that EU user data is processed with specific legal bases and that cross-border transfers meet adequacy requirements. These two forces pull in opposite directions: low latency wants data replicated everywhere; sovereignty wants data restricted to specific regions. Every global system must navigate this tension.

## Mental Model

Think of a multinational bank. Each country has local branches (regional deployments) that serve local customers quickly. The bank has rules about which customer records can leave the country (data sovereignty). Some records (exchange rates, product catalogs) are shared globally; others (personal financial data) must stay local. The bank's headquarters (primary region) coordinates global operations, but each branch operates semi-independently for local transactions.

## Multi-Region Deployment Topologies

### Active-Passive

One region (primary) handles all writes. Other regions have read replicas for local-latency reads. If the primary fails, a secondary is promoted (manual or automated failover — minutes of downtime).

**Traffic flow**: All writes → primary region. Reads → local region's replica. Failover → promote secondary, update DNS/routing.

**The latency problem**: A user in Singapore writing to a primary in US-East pays ~250ms round-trip per write. For most operations (form submissions, settings changes), this is acceptable — users tolerate 250ms on writes more than on reads. For real-time collaboration or high-frequency writes, it's not.

**When to use**: Most applications. Simple, well-understood, minimal conflict risk. Read latency is local; write latency is cross-region but acceptable.

### Active-Active

Multiple regions accept writes simultaneously. Each region has a complete stack. Cross-region replication keeps data synchronized.

**Traffic flow**: All operations → local region (low latency). Background replication synchronizes writes between regions.

**The conflict problem**: Two regions simultaneously modifying the same record creates a write conflict (see [[Multi-Leader and Conflict Resolution]]). This adds complexity — you need conflict detection (version vectors) and resolution (LWW, application merge, CRDTs). This complexity is the primary cost of active-active.

**When to use**: Applications requiring low-latency writes in multiple regions AND where conflict resolution is manageable (shopping carts with LWW, collaborative editing with CRDTs, messaging where ordering per-conversation is sufficient).

### Decision Framework

| Requirement | Active-Passive | Active-Active |
|------------|---------------|---------------|
| Low-latency reads globally | Yes (replicas) | Yes (local) |
| Low-latency writes globally | No (cross-region writes) | Yes (local writes) |
| Conflict handling | None (single writer) | Required (conflict resolution) |
| Failover time | Minutes (promote secondary) | Seconds (traffic reroutes) |
| Operational complexity | Moderate | High |
| Data consistency | Strong (single writer) | Eventual (between regions) |

## Geo-Routing

### Latency-Based DNS (Route 53)

DNS resolves the domain to the region with the lowest measured latency from the user's resolver. Dynamic — adapts as network conditions change. A user in São Paulo might route to US-East (lower latency than EU-West, despite geographic distance, due to undersea cable paths).

### Geo-Fencing

Route users to specific regions based on their IP geolocation. "EU users → EU region" regardless of latency. This is primarily for data sovereignty — ensuring EU user data is processed in the EU — not for latency optimization.

**Implementation**: At the CDN or API gateway level. Cloudflare, CloudFront, and Route 53 all support geolocation-based routing. The routing decision is typically: determine user's country from IP → map country to region → route to that region's endpoint.

### Anycast (covered in [[Anycast and GeoDNS]])

All regions advertise the same IP. BGP routes to the nearest. Natural, automatic, but coarse-grained (BGP "nearest" is hop-count, not latency).

## Data Sovereignty

### The Regulatory Landscape

137+ countries now have data protection laws. The major frameworks:

**GDPR (EU/EEA)**: Data of EU residents must be processed with a legal basis (consent, contract, legitimate interest). Cross-border transfers to countries without an "adequacy decision" require Standard Contractual Clauses (SCCs) or Binding Corporate Rules (BCRs). The right to erasure ("right to be forgotten") requires the ability to delete all of a user's data across all systems.

**CCPA/CPRA (California)**: Consumer right to know what data is collected, right to delete, right to opt out of data sale. Less restrictive on data residency than GDPR.

**PIPL (China)**: Personal data of Chinese residents must be stored in China. Cross-border transfers require a government security assessment. This is the most restrictive major regulation — it effectively requires a China-specific deployment.

**LGPD (Brazil)**: Similar to GDPR. Data must be processed with legal basis. Cross-border transfers require adequacy or contractual guarantees.

### The Architectural Constraints That GDPR Actually Imposes

GDPR's most important architectural implication is widely misunderstood: the regulation constrains *data processing*, not just *data storage*. If EU user data is stored in Frankfurt but your API servers, background jobs, and analytics pipelines run in US-East, every request that reads EU user data and processes it in the US is a cross-border transfer. Storing data in an EU database is necessary but not sufficient. You need EU-based processing: API server fleets in the EU, background jobs that touch EU user data deployed in EU regions, analytics pipelines that run on EU data within EU infrastructure. "Add an EU database replica" becomes "build a parallel EU application stack."

The constraint creates a specific contradiction for companies that started with a US-primary deployment. The naive fix — put EU user data in an EU database, keep the US deployment as the primary — fails in two ways: (1) every EU write transits the Atlantic to the US primary (cross-border transfer), and (2) a US engineer running a query against the primary database can access EU user data without consent. The compliant architecture requires the EU deployment to be a *write primary for EU data*, not a replica — and requires network-level access controls that prevent US-side queries from returning EU user data outside of authorized workflows. This is a much larger change than it sounds.

CockroachDB's `REGIONAL BY ROW` locality correctly maps to this constraint. Setting a table to `LOCALITY REGIONAL BY ROW` assigns each row a `crdb_region` column, and CockroachDB places both the Raft leader and the majority of replicas for that row in the row's home region. A row with `crdb_region = 'eu-west'` has its Raft leader in the EU. Reads and writes for that row are served entirely from EU infrastructure — no data transits to the US for normal operations. US-region nodes hold minority replicas for disaster recovery only and cannot serve reads without contacting the EU leader. This satisfies both storage and processing requirements of GDPR in a single shared database. The trade-off: cross-region operations (a US admin reading an EU user's row) now route to the EU leader, adding 80–150ms. This is acceptable for admin workloads and invisible to EU users.

For teams on Postgres or MySQL, the pattern requires application-level enforcement: route all writes for EU users to the EU-region database, reject cross-region reads in a middleware layer, and audit every background job and analytics query for unintended cross-region data access. The failure mode is subtle: a developer adds a new background job that queries `users` without a region filter, and EU user data begins flowing through US servers. Enforce this at the database access layer with a middleware that injects a mandatory `WHERE user_region = ?` clause based on application context — not in documentation that developers might skip.

### Implementation Strategies

**Geo-partitioned databases**: CockroachDB's locality-aware partitioning pins specific rows to specific regions based on a column value (e.g., `user_country`). EU users' rows physically reside on EU nodes. Reads and writes for those rows are local to the EU region. Cross-region reads are possible but routed through the EU. Spanner's placement policies offer similar functionality.

**Regional deployments with data fencing**: Each region has its own independent database. EU user data is exclusively in the EU deployment. Cross-region queries are prohibited at the infrastructure level (network policies, not just application logic). An analytics layer aggregates anonymized/pseudonymized data across regions.

**Data residency tags**: Each record is tagged with its jurisdiction. A middleware layer enforces that tagged data doesn't leave its region — requests that would transfer data across region boundaries are rejected.

**The right to erasure challenge**: In an event-sourced system, deleting data means purging events — which violates the immutability guarantee. Solutions: crypto-shredding (encrypt user data with a per-user key; "delete" the user by destroying the key — the encrypted events are now unreadable), or tombstone events that mark data as deleted without removing it (weaker — metadata remains).

## Trade-Off Analysis

| Architecture | Write Latency | Consistency | Data Residency | Complexity | Best For |
|-------------|--------------|-------------|---------------|------------|----------|
| Single-region primary + read replicas | Low (in-region) | Strong in primary, eventual in replicas | Data in one region only | Low | Most apps with a primary market |
| Active-passive multi-region | Low (in-region) | Strong in active, stale in passive | Data replicated to passive region | Medium | DR (disaster recovery), regional failover |
| Active-active multi-region | Low per region | Eventual or conflict-resolution needed | Data in all active regions | Very high | Global apps needing low-latency writes everywhere |
| Follow-the-sun (single active, rotating) | Low (in active region) | Strong in active | Data migrated on rotation | High | Global teams with timezone-based primary usage |
| Per-region sharding (data stays local) | Low | Strong per shard | Each region owns its data | Medium | GDPR/data sovereignty, localized workloads |

**Data sovereignty is a business constraint, not a technical one**: GDPR requires EU user data to stay in the EU (with exceptions). Many countries are following suit. The simplest compliant architecture is per-region sharding: EU users' data lives in `eu-west`, US users' in `us-east`. Cross-region queries require federation, which is complex. Design for data locality from the start — retrofitting data sovereignty onto a single-region system is a multi-quarter project.

## Failure Modes

- **Region failover with sovereignty constraints**: The EU region goes down. Users fail over to US-East — but now EU user data is being processed in the US, potentially violating GDPR. Mitigation: fail over to another EU region (EU-West-2), not a non-EU region. This requires multi-AZ within the same geo-political region.

- **Geo-routing misclassification**: A user in Germany uses a VPN with a US exit node. They're routed to the US region. Their data is processed/stored in the US. Mitigation: use the user's registered country (from their profile) for data routing, not their request IP.

- **Cross-region latency during active-active**: A transaction requires data from both EU and US regions (a US admin viewing an EU user's record). Cross-region read latency (~150ms) is added. Mitigation: cache frequently accessed cross-region data with appropriate staleness tolerance, or accept the latency for admin operations.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Geo-Routing Layer (Route 53 / Anycast)"
        User_US[User: New York] -->|Latency-based| Region_US[Region: US-East]
        User_EU[User: Berlin] -->|Geo-Fencing| Region_EU[Region: EU-West]
    end

    subgraph "Region: US-East (Primary)"
        Region_US --> App_US[App Fleet US]
        App_US --> DB_US[(US Data Partition)]
    end

    subgraph "Region: EU-West (Sovereign)"
        Region_EU --> App_EU[App Fleet EU]
        App_EU --> DB_EU[(EU Data Partition)]
    end

    subgraph "Global Sync"
        DB_US -.->|Filtered Replication| DB_EU
    end

    style Region_EU fill:var(--surface),stroke:#2d8a4e,stroke-width:2px;
    style DB_EU fill:var(--surface),stroke:#2d8a4e,stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Speed of Light**: Light in fiber travels at **~200km/ms**. A round-trip New York to Singapore (~15,000km) is at least **150ms** pure physics latency.
- **Write Penalty**: For Active-Passive, writes from Singapore to US-East typically see **250ms - 400ms** latency including application overhead.
- **Egress Cost**: Cross-region data transfer is often **3x - 5x more expensive** than in-region transfer. Minimizing global replication saves significant budget.
- **Failover SLA**: Regional failover (Active-Passive) typically takes **2 - 10 minutes**. Active-Active failover takes **< 30 seconds** (just DNS/Routing change).

## Real-World Case Studies

- **Google Spanner (Placement Policies)**: Google Spanner allows developers to set "Placement Policies" at the row level. You can tag a row with `country=Germany`, and Spanner will ensure that the majority of replicas for that specific row are physically located in German data centers, satisfying both GDPR and low-latency requirements.
- **Apple (iCloud in China)**: To comply with China's PIPL, Apple moved all Chinese user iCloud data to a domestic partner (Guizhou on the Cloud Big Data). This effectively created a "China Island"—a completely separate physical deployment with its own encryption keys and physical security, isolated from the rest of the global iCloud infrastructure.
- **Slack (Migration to Cell-Based)**: Slack moved to a multi-region, cell-based architecture to reduce latency for international users. They found that for users in Japan, moving their "Cell" (all their data and app servers) to an AWS region in Tokyo reduced message send latency by **over 300ms**, dramatically improving the "snappiness" of the UI.

## Connections

- [[Multi-Tenancy and Isolation]] — Tenant location determines data residency requirements
- [[Database Replication]] — Cross-region replication enables read scaling and disaster recovery
- [[NewSQL and Globally Distributed Databases]] — CockroachDB and Spanner natively support geo-partitioned data placement
- [[CDN Architecture]] — CDNs serve static content from the nearest edge, reducing latency globally
- [[Multi-Leader and Conflict Resolution]] — Active-active writes create cross-region conflicts
- [[Cost Engineering and FinOps]] — Multi-region infrastructure multiplies costs; cross-region egress is expensive

## Reflection Prompts

1. Your SaaS product has customers in the EU, US, and Singapore. You currently run a single US-East deployment. A major EU customer requires GDPR compliance with data residency in the EU. What's the minimum-cost architecture change that satisfies the requirement? What if five more customers across three continents make similar demands?

2. You run active-active in US-East and EU-West. A user creates an account in the EU, then travels to the US. Their requests now route to US-East. Should their data physically migrate? What about their reading experience (latency) vs data sovereignty? How do you handle this in your routing logic?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5 discusses geographic replication
- CockroachDB documentation, "Multi-Region Capabilities" — practical geo-partitioning reference
- GDPR official text (gdpr-info.eu) — the regulation itself
- Cloudflare Blog, "Data Localization Suite" — how Cloudflare implements geo-fencing for data residency