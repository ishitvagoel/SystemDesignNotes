# Threat Modeling for Distributed Systems

## Why This Exists

A monolith has one attack surface — its external API. A microservice architecture with 50 services has 50 external-facing endpoints, 200+ internal communication paths, 50 data stores, and hundreds of dependency relationships. Each is a potential attack vector. Threat modeling is the disciplined process of identifying what can go wrong, how likely it is, and how to prevent it — before an attacker finds it for you.

Without threat modeling, security is reactive: you patch vulnerabilities after they're exploited. With it, security is proactive: you identify and mitigate risks at design time, when the cost of fixing them is 10–100× lower.


## Mental Model

Threat modeling is thinking like a burglar before the burglary happens. You walk through your house (system), check every window and door (attack surface), and ask: "If I were a burglar, how would I get in? What would I steal?" STRIDE gives you six categories to think through: could someone pretend to be the homeowner (**S**poofing)? Change the locks without permission (**T**ampering)? Deny they broke in (**R**epudiation)? Read private mail through the letterbox (**I**nformation disclosure)? Block the front door so nobody can enter (**D**enial of service)? Pick the lock and gain homeowner privileges (**E**levation of privilege)? Zero-trust means assuming the burglar is already inside and locking every interior door too.

## Mental Model

Threat modeling is like a home security assessment. You walk around the house asking: "How would a burglar get in?" The front door (SQL injection on the public API). The windows (unsecured internal service endpoints). The garage door opener (leaked API keys). The spare key under the mat (default credentials). For each entry point, you assess: how likely is it? How bad if they succeed? What's the mitigation?

## STRIDE Framework

Microsoft's STRIDE is the most widely used threat categorization. For each component in your system, ask which of these six threats apply:

### Spoofing (Identity)
**Threat**: An attacker pretends to be a legitimate user or service.

**In distributed systems**: Service A impersonates Service B to access B's downstream dependencies. A user forges a JWT token. A DNS hijack redirects traffic to a malicious server.

**Mitigations**: mTLS for service-to-service identity ([[TLS and Certificate Management]]). SPIFFE/SPIRE for automated service identity. JWT signature verification with key rotation. DNSSEC for DNS integrity.

### Tampering (Integrity)
**Threat**: An attacker modifies data in transit or at rest.

**In distributed systems**: Man-in-the-middle alters API responses. An attacker modifies a message in a Kafka topic. A compromised CI pipeline injects malicious code into a build artifact.

**Mitigations**: TLS for all traffic (in transit). Message signing for event integrity. SLSA framework for build artifact integrity ([[Software Supply Chain Security]]). Immutable audit logs.

### Repudiation (Accountability)
**Threat**: An attacker (or a legitimate user) performs an action and later denies it.

**In distributed systems**: "I never authorized that payment." "That API call didn't come from our service." Without audit trails, you can't prove what happened.

**Mitigations**: Comprehensive audit logging (who, what, when, from where). Signed events (non-repudiable). Immutable log storage (append-only, tamper-evident). Correlation IDs that trace actions across services.

### Information Disclosure (Confidentiality)
**Threat**: Sensitive data is exposed to unauthorized parties.

**In distributed systems**: Database backup uploaded to a public S3 bucket. Internal service error messages expose stack traces and database schemas to external clients. Logs containing PII shipped to a third-party log aggregator. Cross-tenant data leakage in a multi-tenant system.

**Mitigations**: Encryption at rest and in transit ([[Encryption at Rest and in Transit]]). Access control on all storage (S3 bucket policies, database permissions). PII scrubbing in logs. Error message sanitization (generic errors externally, detailed errors in internal logs). Row-Level Security for multi-tenancy ([[Multi-Tenancy and Isolation]]).

### Denial of Service (Availability)
**Threat**: An attacker makes the system unavailable.

**In distributed systems**: DDoS flood on the API gateway. A slow query by one tenant degrades service for all tenants. An attacker triggers expensive operations (large file uploads, complex queries) to exhaust resources.

**Mitigations**: Rate limiting at the gateway ([[Rate Limiting and Throttling]]). CDN for DDoS absorption ([[CDN Architecture]]). Auto-scaling with per-tenant resource quotas. Circuit breakers on internal dependencies ([[Resilience Patterns]]).

### Elevation of Privilege (Authorization)
**Threat**: An attacker gains access beyond their authorization level.

**In distributed systems**: Server-Side Request Forgery (SSRF) — an attacker tricks a public-facing service into making requests to internal services (bypassing network boundaries). Exploiting overly broad IAM roles. Accessing the metadata service from a compromised container (AWS IMDS attacks).

**Mitigations**: Network segmentation (services can only reach their declared dependencies). Least-privilege IAM (no wildcard permissions). IMDS v2 (requires a PUT request, preventing SSRF exploitation). Policy engines (OPA, Cedar) for fine-grained authorization ([[Authentication and Authorization]]).

## Zero-Trust Architecture

Traditional security: a hard perimeter (firewall) with a trusted interior ("castle and moat"). Once inside the network, everything trusts everything. This model fails catastrophically when an attacker breaches the perimeter — they have unrestricted lateral movement.

**Zero-trust principle**: "Never trust, always verify." Every request — even internal service-to-service — is authenticated and authorized. There is no "trusted network."

### Implementation Pillars

**Verify identity explicitly**: mTLS between all services. SPIFFE/SPIRE issues and rotates service certificates automatically. Every request carries a verified identity.

**Least-privilege access**: Each service can only access the specific services and data it needs. Kubernetes NetworkPolicies restrict pod-to-pod communication. IAM roles are scoped to specific resources.

**Assume breach**: Design as if an attacker is already inside. Segment networks so a compromised service can't reach unrelated services. Encrypt all traffic (even internal). Monitor for lateral movement (unusual service-to-service traffic patterns). Limit blast radius with [[Cell-Based Architecture]].

## The Threat Modeling Process

**Step 1 — Diagram the system**: Draw the data flow diagram (DFD) showing components, data stores, data flows, and trust boundaries. Trust boundaries are where data crosses between different levels of trust (external → API gateway, API → database, service → third-party API).

**Step 2 — Apply STRIDE per component**: For each component and each data flow that crosses a trust boundary, walk through the six STRIDE categories.

**Step 3 — Prioritize**: Not all threats are equally likely or impactful. Use a risk matrix (likelihood × impact) to prioritize. Focus mitigation effort on high-likelihood, high-impact threats first.

**Step 4 — Mitigate**: For each prioritized threat, define a specific mitigation. "Encrypt data at rest" is a mitigation for information disclosure. "Rate limit per IP" is a mitigation for denial of service.

**Step 5 — Validate**: Review mitigations. Penetration test. Red team exercises. Chaos engineering with security scenarios (inject an SSRF attempt, simulate a compromised service credential).

## Trade-Off Analysis

| Framework | Depth | Learning Curve | Output Quality | Best For |
|-----------|-------|---------------|---------------|----------|
| STRIDE (Microsoft) | Good — covers 6 threat categories | Low — structured checklist | Systematic but can miss context | Teams new to threat modeling, web applications |
| DREAD (risk scoring) | Scoring only — not discovery | Low | Quantitative prioritization | Prioritizing already-identified threats |
| Attack trees | Deep — traces full attack paths | Medium | Excellent for specific scenarios | High-value targets, regulatory analysis |
| PASTA (Process for Attack Simulation) | Deep — business context + technical | High — 7-stage process | Excellent — business-aligned | Enterprise risk management, compliance |
| Lightweight threat modeling (agile) | Moderate — focused on changes | Low | Good enough for continuous delivery | Per-sprint security reviews, fast-moving teams |

**Threat model at the architecture phase, not after**: Retrofitting security is 10-100x more expensive than designing it in. The most effective practice is a lightweight threat model during design review: draw the data flow diagram, identify trust boundaries, apply STRIDE to each boundary crossing, and file tickets for findings. This takes 1-2 hours per feature and catches 80% of design-level security issues.

## Failure Modes

- **Threat model staleness**: The system evolves (new services, new dependencies) but the threat model isn't updated. New attack surfaces go unanalyzed. Mitigation: re-run threat modeling on every significant architecture change. Integrate threat modeling into design review.
- **Checkbox security**: Mitigations are documented but not implemented or tested. "We have mTLS" but half the services use plaintext internally. Mitigation: automated security testing in CI (mTLS verification, network policy enforcement checks).

## Connections

- [[Authentication and Authorization]] — Identity verification and access control
- [[TLS and Certificate Management]] — Encryption and service identity
- [[Software Supply Chain Security]] — Build and deployment pipeline integrity
- [[API Gateway Patterns]] — The primary external trust boundary
- [[Multi-Tenancy and Isolation]] — Cross-tenant threats in shared infrastructure

## Reflection Prompts

1. Your public API gateway accepts user requests and forwards them to internal microservices. An attacker discovers that the gateway passes user-supplied `X-Internal-Service` headers to backends, and backends trust these headers for routing decisions. What STRIDE category is this? What's the attack, and how do you mitigate it?

2. A junior engineer deploys a new internal service that queries the AWS IMDS (metadata service) to get database credentials. The service is also reachable from the public internet (misconfigured security group). Walk through the attack chain, categorize it with STRIDE, and propose mitigations at each layer.

## Canonical Sources

- *Threat Modeling: Designing for Security* by Adam Shostack — the comprehensive guide to STRIDE
- Google BeyondCorp papers (2014–2017) — the original zero-trust architecture at scale
- NIST SP 800-207, "Zero Trust Architecture" — the standard framework definition
- OWASP Top 10 — the most common web application security risks