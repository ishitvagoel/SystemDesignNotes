# Disaster Recovery and RTO/RPO

## Why This Exists

Reliability engineering focuses on preventing failures. Disaster recovery (DR) accepts that some failures are inevitable — the datacenter floods, the cloud region has a multi-hour outage, a ransomware attack encrypts your primary database — and asks: **"How fast can we recover, and how much data can we afford to lose?"**

Without explicit DR planning, the answer to both questions is "we don't know." Without tested DR procedures, the answer is "probably worse than we think." High-profile DR failures (GitLab's 2017 database deletion, Amazon's 2011 EBS outage affecting Netflix) share a common theme: organizations that *had* backups but *had not tested* recovery — and discovered their backup strategy was broken during the incident.

DR is also a compliance requirement. PCI DSS, HIPAA, SOC 2, and ISO 27001 all mandate documented and tested recovery procedures with defined RTO/RPO targets.

## Mental Model

RTO and RPO are **contracts with your business stakeholders**, not technical metrics. They represent what the business can tolerate, not what your infrastructure can achieve. Your DR architecture must achieve better than the contracted RTO and RPO — with margin for the extra complexity real incidents introduce.

Think of RTO and RPO as insurance deductibles:
- **RPO (Recovery Point Objective)**: "How old can the restored data be?" If RPO = 1 hour, you accept losing at most 1 hour of data. The insurance deductible you pay in data loss.
- **RTO (Recovery Time Objective)**: "How long can the system be unavailable?" If RTO = 4 hours, the business accepts up to 4 hours of downtime. The insurance deductible you pay in downtime.

Lower RTO/RPO = lower deductible = higher insurance premiums (more infrastructure cost, complexity, and operational overhead). The business needs to consciously choose the deductible — DR is not a free lunch.

## The Four DR Tiers

Industry categorizes DR strategies by the RTO/RPO they achieve vs. cost:

| Tier | Strategy | RTO | RPO | Cost Multiplier | Example |
|------|----------|-----|-----|-----------------|---------|
| **Tier 1** | Cold Standby (backup-restore) | 24–72 hours | Last backup (hours–days) | 1× | S3 backups + manual restore |
| **Tier 2** | Warm Standby (pilot light) | 1–8 hours | Minutes–hours | 2–3× | Replicated DB, stopped services |
| **Tier 3** | Hot Standby (active-passive) | Minutes | Seconds–minutes | 3–5× | Replica ready to promote |
| **Tier 4** | Active-Active Multi-Region | Near-zero | Near-zero | 5–10× | Traffic split across regions |

**Choosing a tier**: Start with the business's pain threshold for downtime and data loss. A 1-hour revenue window at your business is the cost you're preventing per incident. Compare that to the annual cost of moving from Tier 1 to Tier 3. If a 4-hour outage costs the business $200K and moving to Tier 3 costs $100K/year with 1 outage per 5 years — Tier 3 pays for itself.

## RTO/RPO Measurement and Contracts

### Defining RTO Precisely

RTO is measured from the **declaration of disaster** to **full service restoration at the required capacity**. Common RTO mistakes:
- Starting the clock at incident *discovery* (but detection took 45 minutes — missed)
- Declaring "restored" when 10% of users have access (not 100% of required capacity)
- Not including time for DNS propagation (TTL can add 5–30 minutes)

A rigorous RTO definition: *"From the moment the incident is declared a disaster requiring failover, to the moment 100% of user traffic is being served with < 5% error rate from the DR environment, with no manual steps requiring specialist knowledge."*

### Defining RPO Precisely

RPO is measured as the age of the most recently recovered data at the time of failover. Common RPO mistakes:
- Measuring replication lag in ideal conditions; actual RPO during a failure event may be worse (replica was behind at failure time)
- Not accounting for in-flight transactions at failure time (a database with 30-second replication lag loses all transactions in that window)

### Tiered RTO/RPO by Service

Not all services have the same RTO/RPO requirements. Maintain a **Service Criticality Matrix**:

| Tier | Description | RTO | RPO | Example Services |
|------|-------------|-----|-----|-----------------|
| Tier 1 (Critical) | Revenue-generating, user-facing | < 15 min | < 1 min | Payment processing, checkout |
| Tier 2 (Important) | Significant user impact | < 1 hour | < 15 min | Authentication, product catalog |
| Tier 3 (Standard) | Degraded experience | < 4 hours | < 1 hour | Recommendations, analytics |
| Tier 4 (Background) | Internal / non-user-facing | < 24 hours | < 4 hours | Reporting, admin tools |

Services you didn't tier have implicit RTO/RPO of "whenever an engineer gets around to it" — often weeks for internal tools.

## Backup Architecture

### The 3-2-1 Rule

- **3** copies of data
- **2** different storage types (e.g., primary disk + object storage)
- **1** copy offsite (different region or provider)

Modern extension: **3-2-1-1-0** — additionally, 1 copy offline (air-gapped, ransomware-proof), and 0 errors on verified restore tests.

### Backup Types and Trade-offs

**Full backups**: Complete copy of all data. Largest storage, simplest restore (no dependency chain). Weekly full backups are the baseline.

**Incremental backups**: Only changed data since the last backup. Small daily increments. Restore requires: full backup + all incrementals in order. More complex restore; incremental chain corruption breaks everything.

**Differential backups**: Changed data since the last **full** backup (not since the last backup). Larger than incremental, simpler to restore (full + one differential). A middle ground.

**Continuous replication**: Streaming replication to a hot standby or log archive. Enables point-in-time recovery (PITR) within the retention window. The highest RPO fidelity — recover to any point in the last N days, not just backup intervals.

**Cloud-native snapshots**: EBS snapshots, RDS automated backups, GCS bucket versioning. Managed by the cloud provider, incremental under the hood, fast and cost-efficient. Not a substitute for offsite backups — an AWS account compromise could delete EBS snapshots.

### Backup Verification: The Critical Gap

A backup that has never been tested is an unknown. Common failure modes discovered only during testing:
- Backup jobs silently succeeded but produced corrupt files (verify checksums)
- Restore from S3 took 6 hours (not the 1 hour assumed in the RTO)
- The restored database required schema migrations before services could connect
- The backup included the application data but not the encryption keys stored separately

**Backup verification requirements**:
1. **Automated restore testing**: Monthly automated restore to an isolated environment; verify data integrity via checksums and application-level queries.
2. **Full DR drill**: Quarterly or annual full DR exercise — simulate the disaster, execute the runbook, measure actual RTO/RPO vs. targets.
3. **Chaos engineering for DR**: Use controlled failure injection to verify failover procedures in staging.

## Failure Modes & Production Lessons

**1. GitLab 2017: Backup-not-tested Disaster**
A database admin accidentally deleted the production database with `rm -rf`. Of the five backup strategies GitLab had, four were not working at the time: backup scripts failed silently, replication was off, the snapshot was 6 hours old. Recovery took 18+ hours (far exceeding their implied RTO). The lesson: having backups ≠ having a recovery capability. Run monthly restore drills.

**2. DNS propagation TTL ignored in RTO**
A company tests failover to DR region in 25 minutes. They didn't account for a 30-minute DNS TTL on their main domain. In the actual incident, the failover completes in 25 minutes but users continue hitting the failed region for 30 minutes until DNS propagates. Actual RTO: 55 minutes, not 25. Mitigation: reduce DNS TTL to 60–300 seconds for production FQDNs (this costs nothing); configure health-check-based DNS failover (Route 53 health checks, Cloudflare DNS failover).

**3. Restore dependency on failed system**
The DR runbook requires an engineer to SSH into the primary region to copy the database encryption key to the DR environment. The primary region is down. The DR environment cannot decrypt the backup. Mitigation: store encryption keys independently of the primary data in a separate system (HashiCorp Vault with multi-region replication, AWS KMS in DR region).

**4. Cross-region replication lag spike before failure**
The primary database experiences high write load for 10 minutes before the failure. The replica falls 8 minutes behind (replication lag = 8 minutes). When the region fails, the effective RPO is 8 minutes, not the 1-minute SLA. Mitigation: monitor replication lag as an SLI; alert when it exceeds 50% of your RPO target; use synchronous replication for Tier 1 services despite the write latency penalty.

**5. DR environment configuration drift**
The DR environment was set up 18 months ago. Since then, production gained 12 new environment variables, 3 new service dependencies, and a major schema change. A DR drill fails because the DR environment is incompatible with the current application version. Mitigation: treat DR as code (IaC); use the same CI/CD pipeline to deploy configuration to DR; run monthly canary tests that exercise the DR environment with synthetic traffic.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Primary["Primary Region (us-east-1)"]
        AppPrimary["Application Servers"]
        DBPrimary[("Primary DB\n(Read-Write)")]
        Cache["Cache Cluster"]
    end

    subgraph DR["DR Region (us-west-2)"]
        AppDR["Application Servers\n(stopped in warm standby)"]
        DBReplica[("DB Replica\n(Read-Only, streaming repl)")]
        CacheDR["Cache (empty on failover)"]
    end

    subgraph Backup["Backup Storage (us-west-2 + offsite)"]
        S3["S3 Cross-Region\nReplicated Backups"]
        GlacierDR["Glacier Vault\n(offline, air-gapped)"]
    end

    DBPrimary --> |"async streaming\nreplication (lag < 30s)"| DBReplica
    DBPrimary --> |"daily snapshot"| S3
    S3 --> |"weekly archive"| GlacierDR

    AppPrimary --> DBPrimary
    AppPrimary --> Cache

    DNS["Route 53\n(health-check failover)"] --> AppPrimary
    DNS -.-> |"failover if primary unhealthy"| AppDR
    AppDR -.-> |"after promotion"| DBReplica

    style Primary fill:var(--surface),stroke:var(--accent),stroke-width:2px
    style DR fill:var(--surface),stroke:var(--accent2),stroke-width:2px
    style Backup fill:var(--surface),stroke:#888,stroke-width:1px,stroke-dasharray: 5 5
```

## Back-of-the-Envelope Heuristics

- **Restore time estimation**: 1 TB backup restore from S3 at 500 MB/s ≈ **33 minutes**. Add 10–30 minutes for application startup and health checks. A 4-hour RTO comfortably fits a 2 TB database; a 15-minute RTO requires hot standby.
- **Replication lag budget**: For RPO = 5 minutes, replication lag must stay < 2.5 minutes in steady state (leave 50% margin for lag spikes during high write load). Monitor and alert at 1.5 minutes.
- **Cross-region replication cost**: AWS RDS cross-region replica adds ~$0.10/GB/month for data transfer + replica instance cost. For a 500 GB database: ~$50/month data transfer + ~$400/month replica instance = **~$450/month** for warm standby. Compare to revenue risk.
- **DNS TTL for failover**: 60-second TTL → failover DNS propagation in < 2 minutes. 5-minute TTL → 5 minutes added to RTO. 24-hour TTL (legacy default) → unusable for any automated failover.
- **RPO vs backup interval**: Daily backups → RPO ≤ 24 hours. Hourly backups → RPO ≤ 1 hour. Continuous PITR (WAL archiving) → RPO ≤ 1–5 minutes (depending on WAL shipping frequency).
- **Annual DR drill cost**: A 4-hour DR drill with a 5-person team at $200/hour fully-loaded = $4,000. Against a 4-hour outage costing $50K+ in revenue, this is cheap insurance.

## Real-World Case Studies

- **Stripe (Active-Active with Eventual Failover)**: Stripe runs active-active across multiple US regions for their payment APIs. For their core database (critical financial data), they use synchronous replication — every write is acknowledged by both regions before returning success. This achieves RPO ≈ 0 but adds ~40ms to write latency (cross-region round trip). They accept the latency penalty because financial data cannot afford any loss.

- **Atlassian (2022 Cloud Outage)**: Atlassian accidentally deleted ~400 customer cloud sites during maintenance. Recovery took 2–14 days per customer — far exceeding any reasonable RTO. Investigation revealed: backups existed, but the restore process was manual, untested, and designed for individual-customer restores (not bulk restoration of 400 sites). The incident drove Atlassian to redesign their DR process with automated, tested bulk restore capabilities.

- **PagerDuty (Chaos Engineering for DR Validation)**: PagerDuty runs regular "Disaster Day" exercises: they pick a production service, simulate a region failure, and measure actual failover time and data loss against their RTO/RPO SLAs. Findings from these exercises are treated as P1 incidents — bugs in the DR process are as serious as bugs in the production path. This has caught 8 DR failures before they became real incidents.

## Connections

- [[SLOs SLIs and Error Budgets]] — RTO/RPO targets are reliability SLOs; replication lag is a key SLI
- [[Database Replication]] — Streaming replication is the primary mechanism for sub-minute RPO
- [[Chaos Engineering and Testing]] — DR drills are a form of chaos engineering for the recovery path
- [[Multi-Tenancy and Isolation]] — Multi-tenant systems need per-tenant RTO/RPO guarantees and isolated backup/restore
- [[Incident Management]] — DR invocation is the highest-severity tier of incident response

## Reflection Prompts

1. Your company's CTO says "we need 99.99% availability." You calculate that 99.99% allows ~52 minutes of downtime per year. A single multi-hour cloud region outage would consume the entire annual budget. The alternatives are: (a) active-active multi-region at 5× cost, (b) active-passive with 15-minute RTO at 2× cost, (c) accept that 99.99% in one region is unachievable without redundancy. How do you frame this trade-off for the business?

2. You're designing the backup strategy for a PostgreSQL database with 2 TB of data. Your RTO target is 1 hour, RPO is 15 minutes. Design the backup architecture: backup type(s), frequency, storage tier, verification process. Estimate the monthly cost and calculate whether your architecture meets the RTO/RPO targets.

3. A compliance audit requires a DR drill demonstrating RTO < 4 hours and RPO < 1 hour. You have 6 weeks to prepare. Your current DR environment hasn't been used in 18 months. Walk through your preparation plan: what do you test first, what's the most likely failure mode to discover, and how do you structure the drill to give genuine confidence rather than theater?

## Canonical Sources

- NIST SP 800-34, "Contingency Planning Guide for Federal Information Systems" — RTO/RPO framework
- AWS Well-Architected Framework — Reliability Pillar (DR strategies and patterns)
- Google SRE Book, Chapter 26: "Data Integrity: What You Read Is What You Wrote"
- GitLab.com incident post-mortem (2017) — gitlab.com/gitlab-com/runbooks (public)
- *Database Reliability Engineering* by Laine Campbell & Charity Majors — Chapter 8: Backups and Recovery
