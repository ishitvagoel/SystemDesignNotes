# Audit Logging and Compliance

## Why This Exists

Regulatory frameworks (SOC 2, HIPAA, PCI-DSS, SOX, GDPR) require organizations to prove **who** accessed **what** data, **when**, and **why**. Without immutable, comprehensive audit logs, you can't pass compliance audits, investigate security incidents, or demonstrate that your "Right to be Forgotten" implementation actually works. Audit logging is different from operational logging — it must be tamper-proof, retention-compliant, and queryable for forensic investigation.

## Mental Model / Analogy

Operational logs are a mechanic's notes — they help you fix the car when it breaks. Audit logs are a flight recorder (black box) — they provide an unalterable record of everything that happened, designed to survive even if the plane crashes. You never want to need it, but when you do (a breach, a lawsuit, an audit), it must be complete and trustworthy. A tampered black box is worse than no black box — it destroys trust.

## How It Works

### What Must Be Logged

Not everything needs audit logging — only **security-relevant and compliance-relevant events**:

| Category | Events to Log | Example |
|----------|--------------|---------|
| **Authentication** | Login, logout, failed attempts, MFA events, token refresh | "User X logged in from IP Y at time Z" |
| **Authorization** | Permission changes, role assignments, access denials | "Admin A granted role R to user B" |
| **Data access** | PII reads, sensitive field access, bulk data exports | "User X viewed customer Y's SSN" |
| **Data modification** | Create, update, delete of sensitive records | "User X deleted customer record Y" |
| **Configuration changes** | Security settings, firewall rules, encryption keys | "Admin X disabled MFA requirement for group G" |
| **System events** | Service starts/stops, deployment events, backup operations | "Backup of database D completed at time T" |

### Audit Log Structure

Each audit log entry should be a structured event with:

```json
{
  "timestamp": "2026-03-21T14:32:01.123Z",
  "event_type": "data.access.read",
  "actor": {
    "user_id": "usr_abc123",
    "role": "support_agent",
    "ip_address": "10.0.1.45",
    "session_id": "sess_xyz789"
  },
  "resource": {
    "type": "customer_record",
    "id": "cust_456",
    "fields_accessed": ["email", "phone", "ssn"]
  },
  "context": {
    "service": "support-portal",
    "request_id": "req_def456",
    "justification": "ticket_12345"
  },
  "outcome": "success"
}
```

### Immutability and Tamper-Proofing

Audit logs must be **append-only** and **tamper-evident**:

- **Write-once storage**: Use S3 Object Lock (Compliance mode), Azure Immutable Blob Storage, or GCP Bucket Lock. Once written, objects cannot be modified or deleted — even by root.
- **Cryptographic chaining**: Hash each log entry with the previous entry's hash (similar to a blockchain). If any entry is modified, all subsequent hashes break. Detects tampering in O(n).
- **Separate storage**: Audit logs must be stored in a separate account/project from production, with different access controls. A compromised production account shouldn't be able to delete audit logs.
- **Signed entries**: Each log entry is signed with a service-managed key. Verification proves the entry was written by the authorized logging service, not injected by an attacker.

### Retention Policies

Different regulations require different retention periods:

| Regulation | Minimum Retention | Notes |
|-----------|------------------|-------|
| SOC 2 | 1 year | Type II requires 6+ months of evidence |
| HIPAA | 6 years | From date of creation or last effective date |
| PCI-DSS | 1 year (3 months immediately available) | Older logs can be in cold storage |
| SOX | 7 years | Financial record retention |
| GDPR | No minimum — "as long as necessary" | But must delete when purpose is fulfilled |

**Storage tiering**: Keep recent logs (90 days) in hot storage (Elasticsearch, CloudWatch Logs) for querying. Move older logs to cold storage (S3 Glacier) for compliance retention. This reduces cost by 10–50× for the archive tier.

## Trade-Off Analysis

| Approach | Tamper-Resistance | Query Performance | Cost | Complexity |
|----------|------------------|-------------------|------|-----------|
| Cloud-native (CloudTrail, Azure Activity Log) | High (managed) | Moderate (limited query) | Low–Medium | Low |
| SIEM (Splunk, Elastic SIEM) | Medium (software-enforced) | High (full-text search) | High | Medium |
| Immutable ledger (Amazon QLDB, custom) | Very high (cryptographic) | Low–Moderate | Medium | High |
| Write-once object storage (S3 Object Lock) | Very high (infrastructure-enforced) | Low (batch query only) | Low | Low |

## Failure Modes & Production Lessons

- **Log gaps during outages**: The audit logging service goes down during a production incident. All data access events during the outage are lost. The compliance team discovers the gap during the annual audit. **Lesson**: Audit logging must be resilient — use local buffering (write to disk first, forward async), redundant collection, and monitor for log gaps.
- **Over-logging PII in audit logs**: Audit logs record the full customer record for every access event, including SSN and credit card numbers. Now the audit log itself is a PII store requiring its own deletion process. **Lesson**: Log the event metadata (who, what resource, when) but not the data content itself. Log "User X accessed customer Y's SSN" — not the actual SSN value.
- **Retention mismatch**: GDPR requires data deletion, but SOX requires 7-year retention. A deleted user's audit logs contain their user ID, which the compliance team argues is PII. **Lesson**: Pseudonymize user identifiers in audit logs after deletion. Replace `user_id` with a hash. The audit trail is preserved but can't be linked back to the individual.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Application Layer"
        Svc1[Service A] --> Sidecar1[Audit Sidecar]
        Svc2[Service B] --> Sidecar2[Audit Sidecar]
    end

    subgraph "Collection"
        Sidecar1 & Sidecar2 --> Buffer[Local Buffer: Disk]
        Buffer --> Collector[Log Collector: Fluentd]
    end

    subgraph "Storage"
        Collector --> Hot[Hot: Elasticsearch: 90 days]
        Collector --> Archive[Cold: S3 Object Lock: 7 years]
        Archive -.-> Verify[Integrity Verifier: Hash Chain]
    end

    style Archive fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Verify fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Log volume**: Audit logs are typically **2–5× the volume** of operational logs if every data access is tracked. Use sampling for non-sensitive data access to manage volume.
- **Hot storage cost**: Elasticsearch costs approximately **$0.10–0.30/GB/month**. At 1TB/day of audit logs, that's **$3K–9K/month** for 90-day hot retention.
- **Cold storage cost**: S3 Glacier Deep Archive is **$0.00099/GB/month**. 7 years of 1TB/day audit logs costs **~$2,500/month** — 100× cheaper than hot storage.
- **Query latency**: Hot storage (Elasticsearch): **milliseconds**. Cold storage (S3 + Athena): **seconds to minutes**.

## Real-World Case Studies

- **Capital One (2019 Breach)**: The investigation relied heavily on AWS CloudTrail audit logs to trace the attacker's actions — which S3 buckets were accessed, which IAM roles were assumed, and the exact timeline. Without CloudTrail, forensic investigation would have been impossible. This case cemented CloudTrail as a non-negotiable for AWS deployments.
- **Stripe (PCI-DSS Compliance)**: Stripe maintains audit logs for all access to cardholder data environments. They use a combination of infrastructure-level logging (CloudTrail, VPC Flow Logs) and application-level audit events (which service accessed which card token). Logs are stored in a separate AWS account with MFA-delete protection.

## Connections

- [[Data_Privacy_and_Compliance]] — Audit logging is a core requirement of most privacy regulations
- [[GDPR_and_Data_Sovereignty]] — Audit logs must handle the tension between retention requirements and deletion rights
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] — WAL is an analogous concept: append-only, ordered, recoverable
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — Audit alerting (suspicious access patterns) uses the same infrastructure as operational alerting

## Reflection Prompts

1. A security incident occurs at 2 AM. By 9 AM, the attacker has been blocked, but you need to determine exactly what data was accessed. Your audit logs are in S3 with no hot query layer. How do you build a forensic timeline quickly? What would you change about your audit logging architecture to make future investigations faster?

2. Your audit log system uses a sidecar pattern. During a Kubernetes node failure, 3 pods crash before their audit sidecars can flush buffered events. How do you design the audit pipeline to guarantee no events are lost, even during infrastructure failures?

## Canonical Sources

- AICPA SOC 2 Trust Services Criteria — CC7.2, CC7.3, CC7.4 (logging and monitoring requirements)
- NIST SP 800-92, "Guide to Computer Security Log Management"
- HIPAA Security Rule, §164.312(b) — Audit controls standard
- AWS CloudTrail documentation — the de facto standard for cloud audit logging
