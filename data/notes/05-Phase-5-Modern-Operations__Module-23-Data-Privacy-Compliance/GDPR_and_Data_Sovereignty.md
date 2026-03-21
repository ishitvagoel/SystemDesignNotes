# GDPR and Data Sovereignty

## Why This Exists

Data doesn't respect borders, but laws do. The EU's General Data Protection Regulation (GDPR), China's PIPL, Brazil's LGPD, and India's DPDPA impose strict rules on where personal data can be stored, how it can be processed, and what rights individuals have over their data. For globally distributed systems, these regulations are architectural constraints — they determine which regions your databases can live in, how data flows between services, and what deletion capabilities you must build. Ignoring data sovereignty results in fines (up to 4% of global annual turnover for GDPR), enforcement actions, and loss of market access.

## Mental Model / Analogy

Data sovereignty is like customs at international borders. Your data (goods) can move freely within the EU (single market), but crossing into a non-EU country requires proper paperwork (Standard Contractual Clauses, adequacy decisions). Some countries (China, Russia) have strict "no export" rules — the data must stay within the country's borders, period. Your architecture is the logistics network: you need warehouses (data centers) in each jurisdiction, customs checkpoints (data transfer controls), and manifests (audit logs) proving every cross-border movement was authorized.

## How It Works

### Key Regulatory Frameworks

| Regulation | Jurisdiction | Key Requirements | Penalty |
|-----------|-------------|-----------------|---------|
| **GDPR** | EU/EEA | Consent, right to erasure, data minimization, breach notification (72h), DPO requirement | Up to 4% global revenue or €20M |
| **CCPA/CPRA** | California | Right to know, delete, opt-out of sale, data portability | $7,500/intentional violation |
| **PIPL** | China | Data localization, consent for cross-border transfer, security assessments | Up to ¥50M or 5% revenue |
| **LGPD** | Brazil | Similar to GDPR; data protection officer, consent basis | Up to 2% revenue or R$50M |
| **DPDPA** | India | Consent, data fiduciary obligations, cross-border transfer restrictions | Up to ₹250 crore (~$30M) |

### Data Residency Architecture

**Cell-based deployment**: Deploy independent regional cells (EU, US, APAC) that contain all services and data for users in that jurisdiction:

1. **User registration**: Assign users to a home region based on their legal jurisdiction (not their IP address — a German citizen traveling in the US is still under GDPR)
2. **Request routing**: API gateway or DNS-based routing directs requests to the correct regional cell
3. **Data isolation**: Each cell has its own database, cache, and object storage. No PII crosses cell boundaries
4. **Global services**: Non-PII services (product catalog, static content) can be global. PII-containing services must be regional

**Cross-border data transfer mechanisms** (when data must leave a jurisdiction):
- **Adequacy decisions**: The EU has determined certain countries provide "adequate" protection (UK, Japan, South Korea, etc.). Data flows freely to these countries.
- **Standard Contractual Clauses (SCCs)**: Legal agreements between data exporter and importer. Required for transfers to non-adequate countries (including the US, post-Schrems II).
- **Binding Corporate Rules (BCRs)**: Internal policies for multinational corporations to transfer data within the company. Expensive to implement but cover the entire organization.
- **Encryption with regional key management**: Encrypt data before transferring. Encryption keys stay in the source region. The destination can process encrypted data but cannot decrypt without the source region's cooperation.

### Right to Erasure (Article 17 GDPR)

When a user requests deletion, you must remove their personal data from all systems within 30 days. In a distributed system, this is architecturally challenging:

**Crypto-shredding** (preferred at scale): Encrypt all of a user's PII with a user-specific key. To "delete" the user, destroy the key. All their data becomes unreadable across databases, backups, logs, and caches — without needing to find and delete every record.

**Direct deletion** (simpler systems): Delete user records from primary database, invalidate caches, purge from search indexes, remove from analytics pipelines. Must track all systems that store user data — a data flow map is essential.

### Consent Management

GDPR requires **specific, informed, freely given consent** for each data processing purpose:

- **Consent service**: A microservice that stores per-user consent records (what they consented to, when, which version of the privacy policy)
- **Consent-gated processing**: Before processing user data for a specific purpose (analytics, marketing, personalization), check the consent service. Process only data for consented purposes.
- **Consent withdrawal**: Users can withdraw consent at any time. The system must stop processing for that purpose immediately and delete data collected under that consent basis.

## Trade-Off Analysis

| Approach | Compliance Strength | Operational Cost | Latency Impact |
|----------|-------------------|-----------------|----------------|
| Single-region deployment | Full compliance for one jurisdiction | Low | High for remote users |
| Multi-region cells (full isolation) | Strong — data never leaves region | High — N copies of infrastructure | Low — data is local |
| Multi-region with encrypted cross-border | Good — data encrypted in transit | Medium | Medium — cross-region calls |
| Global deployment with legal mechanisms (SCCs) | Moderate — depends on legal validity | Low | Low |

## Failure Modes & Production Lessons

- **The "analytics backdoor"**: Production data is properly isolated by region, but the analytics pipeline aggregates all users into a single global data warehouse without PII controls. A GDPR audit discovers EU user data in a US-hosted Snowflake instance. **Lesson**: Data sovereignty applies to ALL systems — analytics, logs, backups, ML training datasets. Map every data flow.
- **Consent version mismatch**: The privacy policy is updated, but the consent service still references the old version. Users who consented under v1 haven't re-consented under v2. Processing their data under v2 terms is legally invalid. **Lesson**: Version consent records. When policies change materially, re-consent is required for affected processing purposes.
- **Backup retention vs right to erasure**: User requests deletion. Primary DB is purged, but encrypted backups retained for 7 years contain the user's data. Restoring from backup re-materializes deleted users. **Lesson**: Use crypto-shredding so backups become unreadable when the key is destroyed. Or maintain a "deletion ledger" — after any backup restore, replay all deletion events.

## Architecture Diagram

```mermaid
graph TD
    User((User)) -->|DNS Routing| Router[Geo-Aware API Gateway]

    Router -->|EU User| EU_Cell[EU Cell: eu-west-1]
    Router -->|US User| US_Cell[US Cell: us-east-1]

    subgraph "Regional Cell"
        App[App Service] --> ConsentSvc[Consent Service]
        App --> DB[(Regional DB)]
        App --> PIIVault[PII Vault]
        PIIVault --> KMS[Regional KMS]
    end

    EU_Cell -.->|SCCs + Encryption| Analytics[Global Analytics: Anonymized Only]
    US_Cell -.-> Analytics

    style PIIVault fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style KMS fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **GDPR deletion SLA**: 30 days maximum. Design for completion within **7 days** to allow for edge cases and retries.
- **Multi-region cost premium**: Running isolated cells in 3 regions costs approximately **2.5–3× a single-region deployment** (not 3× due to shared non-PII services).
- **Consent check latency**: A consent service lookup adds **5–15ms per request**. Cache consent decisions locally with a **5-minute TTL** to reduce overhead.
- **Data flow mapping**: A typical B2C application has **15–30 systems** that touch PII (databases, caches, logs, analytics, third-party integrations). All must be in the deletion path.

## Real-World Case Studies

- **Meta (€1.2B GDPR Fine, 2023)**: Meta was fined €1.2 billion for transferring EU user data to US servers without adequate legal basis after the Schrems II ruling invalidated the Privacy Shield. This forced a major architectural change — Meta now processes EU data in EU data centers.
- **TikTok (Project Texas)**: To address US government data sovereignty concerns, TikTok created "Project Texas" — routing all US user data to Oracle-managed servers in the US, with Oracle acting as a trusted third party that audits data access. This is an example of "sovereignty by architecture."

## Connections

- [[Data Privacy and Compliance]] — The broader privacy framework this fits within
- [[Cell-Based Architecture]] — Cell-based design is the architectural pattern enabling data residency
- [[Encryption at Rest and in Transit]] — Encryption is a key mechanism for cross-border data transfer compliance
- [[Multi-Region Strategies]] — Data sovereignty is often the primary driver of multi-region architecture decisions

## Reflection Prompts

1. Your SaaS company serves customers in the EU, US, and India. A new customer in Germany signs up. Walk through the architectural decisions: where is their data stored, how is consent captured, what happens when they request deletion, and what changes if they transfer to your India office?

2. Your analytics team wants to train an ML model on global customer behavior data. EU regulations prevent raw PII from leaving the EU. How would you architect a system that enables global ML training while maintaining data sovereignty? Consider federated learning, differential privacy, and anonymization approaches.

## Canonical Sources

- GDPR full text (gdpr-info.eu) — the regulation itself, especially Articles 5, 6, 17, 44-49
- CJEU Schrems II ruling (Case C-311/18) — invalidated Privacy Shield, shaped current cross-border transfer rules
- NIST Privacy Framework (nist.gov) — US-centric privacy risk management framework
- The FinOps Foundation, "Data Sovereignty" whitepaper — practical implementation guidance
