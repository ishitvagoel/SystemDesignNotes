# Data Classification and Access Control

## Why This Exists

You cannot protect data you haven't classified. Without systematic data classification, organizations apply the same security controls to public marketing copy and customer Social Security numbers — either over-protecting everything (expensive, slow) or under-protecting sensitive data (breach risk). Data classification assigns sensitivity levels to data, and access control enforces who can access each level. Together, they implement the **principle of least privilege**: every person and service gets the minimum access necessary to do their job.

## Mental Model / Analogy

Think of a hospital. Patient medical records (highly sensitive) are in locked rooms with badge access, video surveillance, and sign-in sheets. The cafeteria menu (public) is posted on a bulletin board. Employee schedules (internal) are on a shared intranet. Nobody argues that the cafeteria menu needs the same security as patient records. Data classification is deciding which information goes in which category, and access control is building the locks, badges, and sign-in sheets for each.

## How It Works

### Data Classification Tiers

| Tier | Label | Examples | Controls Required |
|------|-------|---------|-------------------|
| **Tier 1** | Public | Marketing content, public APIs, documentation | None — freely available |
| **Tier 2** | Internal | Employee directories, internal wikis, non-sensitive configs | Authentication required |
| **Tier 3** | Confidential | Customer PII (name, email, phone), financial data, contracts | Encryption at rest + in transit, access logging, need-to-know basis |
| **Tier 4** | Restricted | SSNs, health records (PHI), payment card data (PCI), biometrics | Encryption, MFA for access, audit logging, tokenization, DLP monitoring |

### Automated PII Detection

Manual classification doesn't scale. Use automated scanning tools to discover and tag PII:

- **AWS Macie**: Scans S3 buckets for PII (credit cards, SSNs, names, addresses) using ML classifiers
- **Google Cloud DLP**: Identifies, classifies, and de-identifies sensitive data across GCP services
- **Open-source**: Microsoft Presidio (NLP-based PII detection), piiscan, detect-secrets (for credentials in code)

**Integrate into CI/CD**: Scan code commits for hardcoded secrets and PII. Block merges that contain unencrypted sensitive data.

### Access Control Models

| Model | How It Works | Best For |
|-------|-------------|----------|
| **RBAC (Role-Based)** | Users are assigned roles; roles have permissions. "Support Agent" can read customer records but not billing data. | Most applications — simple, auditable, scalable |
| **ABAC (Attribute-Based)** | Access decisions based on attributes of user, resource, and context. "EU employees can access EU data during business hours." | Complex policies, multi-tenant, regulatory requirements |
| **ReBAC (Relationship-Based)** | Access based on relationships. "User X can view document Y because X is in team Z which owns project P that contains Y." | Google Drive-style sharing, organizational hierarchies |

### Row-Level Security (RLS)

For multi-tenant databases, RLS enforces data isolation at the database layer:

```sql
-- PostgreSQL RLS example
ALTER TABLE customer_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customer_data
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Every query automatically filters to the current tenant's data — even if application code has a bug that omits the tenant filter. RLS is a defense-in-depth layer that prevents cross-tenant data leakage.

### Data Masking

Show different views of the same data based on the accessor's role:

| Accessor | Customer Email | SSN | Phone |
|----------|---------------|-----|-------|
| Customer (self) | john@example.com | ***-**-1234 | (555) 123-4567 |
| Support agent | john@example.com | ***-**-**** | (555) ***-4567 |
| Analytics | user_abc123@hash | [removed] | [removed] |
| ML training | [anonymized] | [removed] | [removed] |

**Dynamic masking** applies at the query layer — the underlying data is unchanged, but different roles see different views. This is simpler than maintaining multiple copies of the data at different sensitivity levels.

## Trade-Off Analysis

| Approach | Security | Performance Impact | Implementation Complexity |
|----------|---------|-------------------|--------------------------|
| Application-level access control | Flexible, feature-rich | Low — in-app checks | Medium — every endpoint must check |
| Database-level RLS | Strong defense-in-depth | Low — query filter | Low — database-enforced |
| API Gateway authorization | Centralized, consistent | Low — gateway-level check | Medium — requires policy engine |
| Data masking (dynamic) | Good for read paths | Moderate — masking overhead | Medium — masking rules per field |
| Tokenization (PII Vault) | Very strong — PII isolated | Higher — vault lookup per access | High — requires dedicated vault service |

## Failure Modes & Production Lessons

- **Broken access control (OWASP #1)**: An API endpoint checks if the user is authenticated but not if they're authorized to access the specific resource. User A can access User B's data by changing the ID in the URL. **Lesson**: Always check authorization at the resource level, not just authentication at the endpoint level. Use IDOR (Insecure Direct Object Reference) testing in security reviews.
- **RLS bypass via admin tools**: Row-level security is configured for the application, but the DBA uses a superuser connection that bypasses RLS. An accidental query leaks cross-tenant data. **Lesson**: Set `FORCE ROW LEVEL SECURITY` for table owners too, or use separate database roles for admin operations with explicit audit logging.
- **Classification drift**: Data is classified as "Internal" at creation, but a new feature starts exposing it to customers (making it effectively "Public") without reclassifying or adjusting controls. **Lesson**: Re-classify data when access patterns change. Include data classification review in feature design reviews.

## Architecture Diagram

```mermaid
graph TD
    User((User)) --> AuthZ[Authorization Service: RBAC/ABAC]
    AuthZ --> Policy[Policy Engine: OPA/Cedar]

    subgraph "Data Access Layer"
        Policy --> API[API Service]
        API --> Masking[Dynamic Masking Layer]
        Masking --> DB[(Database with RLS)]
    end

    subgraph "PII Protection"
        API --> Vault[PII Vault: Tokenization]
        Vault --> KMS[Key Management]
    end

    subgraph "Detection"
        Scanner[PII Scanner: Macie/DLP] -.-> DB
        Scanner -.-> Logs[Log Streams]
    end

    style Policy fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Vault fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **RBAC scale limit**: Most organizations need **20–50 roles**. More than 100 roles usually indicates over-granular RBAC — consider switching to ABAC.
- **RLS performance**: PostgreSQL RLS adds **<1ms overhead** per query for simple policies. Complex policies with joins may add more.
- **PII scanning**: AWS Macie processes approximately **1TB for ~$1** in scanning costs. Run weekly scans on data stores.
- **Token vault latency**: A PII vault lookup adds **10–50ms** per de-tokenization. Batch de-tokenization (e.g., for reports) reduces amortized latency to **<1ms per record**.

## Real-World Case Studies

- **Google (Zanzibar / SpiceDB)**: Google built Zanzibar, a global authorization system that handles trillions of access checks per second across all Google products. It uses relationship-based access control (ReBAC), modeling permissions as relationships in a graph. SpiceDB is an open-source implementation inspired by Zanzibar, used by companies like Authzed, GitHub, and Airbnb.
- **Uber (Queryguard)**: Uber built an internal tool that intercepts database queries and dynamically masks PII based on the accessor's role and the data's classification. A support agent querying customer data sees masked SSNs and credit cards, while the billing service sees full values. All access is audit-logged with the accessor's identity and business justification.

## Connections

- [[Data_Privacy_and_Compliance]] — Classification and access control are foundational to all compliance frameworks
- [[GDPR_and_Data_Sovereignty]] — GDPR's "data minimization" principle requires classification to determine what data is necessary
- [[Audit_Logging_and_Compliance]] — Access control decisions must be audit-logged
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization]] — Identity is the prerequisite for access control
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Encryption_at_Rest_and_in_Transit]] — Encryption protects data at the storage layer; access control protects it at the application layer

## Reflection Prompts

1. Your multi-tenant SaaS application uses application-level tenant filtering (`WHERE tenant_id = ?`) in every query. A junior developer forgets the filter in a new endpoint, exposing Tenant A's data to Tenant B. How would you add defense-in-depth using database-level RLS, and what's the operational cost of maintaining RLS policies as the schema evolves?

2. Your company has 500 database tables. You need to classify every column by sensitivity tier and apply appropriate masking rules. How would you automate this classification, and what's your process for handling false positives (public data classified as PII) and false negatives (PII missed by the scanner)?

## Canonical Sources

- OWASP Top 10 — A01:2021 Broken Access Control (the #1 web application security risk)
- Google, "Zanzibar: Google's Consistent, Global Authorization System" (USENIX ATC '19)
- NIST SP 800-53 — Security and Privacy Controls (AC family: Access Control)
- AWS Macie documentation — automated PII discovery and classification
