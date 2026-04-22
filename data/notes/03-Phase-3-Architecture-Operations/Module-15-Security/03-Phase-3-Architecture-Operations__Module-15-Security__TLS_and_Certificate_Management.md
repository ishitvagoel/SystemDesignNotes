# TLS and Certificate Management

## Why This Exists

Every network communication in a production system must be encrypted. TLS (Transport Layer Security) provides this encryption, plus server authentication (the client verifies the server is who it claims to be). In a zero-trust architecture, mTLS extends this to mutual authentication — both sides verify each other.

But TLS is only as reliable as the certificates it uses. An expired certificate causes an outage that looks exactly like a service failure — but no amount of scaling or restarting fixes it. A compromised private key allows eavesdropping on all traffic encrypted with that key. Certificate management at scale is one of the most operationally critical — and underappreciated — security practices.


## Mental Model

TLS is like two strangers meeting at a party, verifying each other's identities through a mutual friend, and then agreeing on a secret language for the rest of the night. The "mutual friend" is the Certificate Authority (CA) — a trusted party that vouches for each person's identity by signing their certificate. The "secret language" is the symmetric encryption key they negotiate during the handshake. mTLS is when both people show their CA-signed IDs to each other (not just the server to the client). At scale, certificate management is like running an ID card office for a city of millions — cards expire, need renewal, get revoked, and every citizen needs one that's always valid.

## TLS 1.3

TLS 1.3 (RFC 8446, 2018) simplified and hardened the handshake compared to TLS 1.2:

### 1-RTT Handshake

In TLS 1.2, the handshake took 2 round-trips before encrypted data could flow. TLS 1.3 reduces this to 1 RTT:

1. Client sends `ClientHello` with supported cipher suites AND a key share (Diffie-Hellman public value).
2. Server responds with `ServerHello`, its key share, the server certificate, and the `Finished` message — all in one flight.
3. Both sides now have the shared secret. Encrypted application data begins immediately.

On a 50ms RTT link, this saves 50ms per new connection — significant for services making thousands of new TLS connections per second.

### 0-RTT Resumption

For repeat connections, TLS 1.3 supports **0-RTT**: the client sends encrypted application data in its very first message, using a Pre-Shared Key (PSK) from a previous session.

**The trade-off**: 0-RTT data is vulnerable to **replay attacks**. An attacker who captures the client's first message can resend it — the server might process the same request twice. Mitigation: only use 0-RTT for idempotent requests ([[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]]). Servers should implement anti-replay mechanisms (single-use session tickets, request deduplication).

### Security Improvements

TLS 1.3 removed everything that was broken or risky in TLS 1.2:
- **No RSA key exchange**: Only ephemeral Diffie-Hellman (ECDHE). This provides **forward secrecy** — even if the server's private key is later compromised, past sessions can't be decrypted.
- **No CBC cipher suites**: Only AEAD ciphers (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305). Eliminates padding oracle attacks.
- **No MD5/SHA-1**: Only SHA-256+.

## mTLS (Mutual TLS)

Standard TLS: the server proves its identity (presents a certificate signed by a trusted CA). The client is anonymous at the transport layer.

**mTLS**: Both sides present certificates. The server verifies the client's certificate. The client verifies the server's certificate. Both identities are cryptographically established.

**Use case — service-to-service authentication**: In a microservice architecture, mTLS ensures that only authorized services communicate. The order-service presents its certificate to the payment-service; payment-service verifies it against the internal CA. No API keys, no tokens, no credentials in code — identity is cryptographic and automatic.

**The implementation challenge**: Every service needs a certificate. Certificates must be issued, distributed, and rotated. With 100 services × 10 instances = 1,000 certificates to manage. Manual management is impossible at this scale.

### SPIFFE and SPIRE

**SPIFFE** (Secure Production Identity Framework For Everyone) standardizes service identity:
- Each service gets a **SPIFFE ID**: `spiffe://cluster.local/ns/production/sa/order-service`
- Identity is expressed as an **SVID** (SPIFFE Verifiable Identity Document): an X.509 certificate with the SPIFFE ID in the SAN (Subject Alternative Name) field.

**SPIRE** (SPIFFE Runtime Environment) is the implementation:
- SPIRE Server acts as the CA. It issues short-lived SVIDs (certificates that last 1 hour, auto-renewed every 30 minutes).
- SPIRE Agent runs on each node and provides SVIDs to workloads via a local API.
- Workloads never handle private key generation or certificate rotation — SPIRE handles everything.

**Why short-lived certificates matter**: A 1-year certificate that's compromised remains valid for up to a year (unless you manage a CRL or OCSP, which is complex and slow). A 1-hour certificate is useless after an hour. The window of exposure from a compromise shrinks from months to minutes. And since renewal is automatic, there's no "certificate expiry outage" — if renewal fails, the certificate expires in 30 minutes, giving the team time to investigate.

## Certificate Management at Scale

### The Expiry Problem

Certificate expiry is the #1 avoidable cause of TLS-related outages:
- **2020**: Spotify, Microsoft Teams, and others experienced outages from expired certificates
- **2021**: Let's Encrypt's root certificate expiry (DST Root CA X3) caused widespread issues for older clients

**Why it keeps happening**: Certificates are set-and-forget. An engineer configures TLS, sets a 1-year certificate, and nobody remembers to renew it 364 days later. The organization's institutional memory doesn't span certificate lifetimes.

### Automated Certificate Management

**Let's Encrypt + ACME protocol**: Free, automated TLS certificates for public-facing services. The ACME protocol handles issuance and renewal automatically. Certificates last 90 days and are renewed every 60 days — if renewal fails, there's a 30-day grace period to fix it.

**cert-manager** (Kubernetes): Automates certificate lifecycle in Kubernetes. Supports Let's Encrypt, HashiCorp Vault, Venafi, and other CAs. Watches for expiring certificates and renews them automatically. The standard for TLS in Kubernetes.

**HashiCorp Vault PKI engine**: Acts as an internal CA for service certificates. Issues short-lived certificates (1–24 hours). Combined with SPIRE, this eliminates manual certificate management entirely.

### TLS Termination Architecture

| Approach | Pros | Cons | Use Case |
|----------|------|------|----------|
| **At load balancer** | Centralized cert management, LB can inspect HTTP | LB → backend is unencrypted (OK in trusted VPC) | Most common |
| **At service (end-to-end)** | Full encryption, no plaintext hop | Cert management on every service | Zero-trust environments |
| **At LB + re-encrypt to backend** | Full encryption + L7 features | Double crypto overhead | Compliance-required environments |

## Trade-Off Analysis

| Certificate Type | Validation Level | Issuance Speed | Cost | Trust Level | Best For |
|-----------------|-----------------|---------------|------|------------|----------|
| DV (Domain Validated) | Domain ownership only | Minutes (automated) | Free (Let's Encrypt) or cheap | Basic — browser padlock | Most web services, APIs, internal services |
| OV (Organization Validated) | Domain + org verification | Days | Moderate | Medium — org name in cert | Business websites, public-facing APIs |
| EV (Extended Validation) | Domain + org + legal verification | Weeks | Expensive | Highest — green bar (deprecated in most browsers) | Financial institutions (diminishing returns) |
| Self-signed | None | Instant | Free | None — browsers warn | Development, testing, internal services with custom CA |
| Private CA (internal) | Organization-controlled | Minutes (automated) | Infrastructure cost | Internal trust | Service-to-service mTLS, zero-trust networks |

**Automate everything with ACME**: Manual certificate management is the #1 cause of TLS-related outages. Certificates expire, teams forget to renew, and suddenly production goes down. Let's Encrypt + ACME protocol (via cert-manager in K8s, or Caddy/Traefik's built-in ACME) automates issuance and renewal. For internal certs, run an internal CA (Vault PKI, step-ca) with the same automation principle.

## Failure Modes

- **Certificate expiry outage**: The most common TLS failure. The service starts returning TLS handshake errors. Looks like a service outage but no amount of restarting fixes it. Mitigation: monitor certificate expiry dates (alert 30 days before), automate renewal with cert-manager or ACME.

- **CA compromise**: Your internal CA's private key is compromised. All certificates it issued can be forged. Mitigation: use HSMs for CA key storage, rotate the CA periodically, maintain the ability to re-issue all certificates quickly (SPIRE makes this trivial).

- **Clock skew + TLS**: TLS certificates have a validity window (not-before, not-after). If a server's clock is wrong, valid certificates appear expired (or not yet valid). Mitigation: NTP synchronization on all servers, monitor clock drift.

- **Intermediate certificate chain missing**: The server presents its leaf certificate but not the intermediate certificates. Some clients (which have the intermediates cached) work; others fail. Debugging is maddening because it works "on my machine." Mitigation: always configure the full certificate chain (leaf + intermediates).

## Architecture Diagram

```mermaid
graph TD
    subgraph "External Traffic (TLS 1.3)"
        User[Client Browser] -->|1. HTTPS Handshake| LB[Cloud Load Balancer]
        LB -->|2. SSL Termination| App[App Gateway]
    end

    subgraph "Internal Mesh (mTLS)"
        App -->|3. mTLS: Client Cert| S1[Service A]
        S1 -->|4. mTLS: Client Cert| S2[Service B]
    end

    subgraph "Control Plane (SPIRE / cert-manager)"
        CA[(Internal CA / Vault)]
        CA -->|5. Issue Short-lived Certs| S1
        CA -->|5. Issue Short-lived Certs| S2
    end

    style CA fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style LB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Handshake Latency**: TLS 1.3 reduces the handshake from **2 RTTs** to **1 RTT**, saving **50ms - 200ms** on new connections globally.
- **Certificate TTL**: Modern security standard is **< 90 days** for public certs (Let's Encrypt) and **< 24 hours** for internal mTLS certs (SPIRE).
- **Renewal Window**: Automate renewals when **1/3 of the lifetime** remains (e.g., renew a 90-day cert at 60 days).
- **CPU Overhead**: Modern AES-NI hardware makes TLS overhead negligible (**< 1% CPU**). The primary cost is the memory for concurrent connection state.

## Real-World Case Studies

- **Spotify (2020 Outage)**: Spotify suffered a global outage because a single TLS certificate for their internal service-to-service communication expired. Because they lacked automated monitoring and renewal for that specific internal CA, it took hours to identify the "expired ID card" as the root cause of the system-wide failure.
- **Cloudflare (Keyless SSL)**: Cloudflare pioneered **Keyless SSL**, allowing customers to use Cloudflare's CDN without giving Cloudflare their private keys. When a TLS handshake happens, Cloudflare proxies the "signing" step back to the customer's on-prem hardware security module (HSM), proving that you can have both edge performance and central key control.
- **Google (ALTS)**: Google doesn't use standard X.509 certificates for most of its internal service-to-service traffic. They built **ALTS (Application Layer Transport Security)**, which is a specialized, high-performance protocol similar to mTLS but optimized for their massive data center scale, using simpler identities and faster handshakes.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-15-Security__Encryption_at_Rest_and_in_Transit]] — TLS is encryption in transit; this note covers the certificate infrastructure
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization]] — mTLS provides service identity; OAuth2/OIDC provides user identity
- [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]] — TLS termination at the LB is the most common pattern
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Threat_Modeling_for_Distributed_Systems]] — mTLS mitigates spoofing and tampering threats
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Zero_Trust_Architecture]] — SPIFFE/SPIRE uses X.509-SVID (a TLS certificate format) as the service identity carrier

## Reflection Prompts

1. Your organization has 200 microservices with annual TLS certificates managed manually (each team handles their own). You experience one certificate expiry outage per month. Design a migration plan to automated certificate management with short-lived certificates. What's the rollout strategy?

2. You enable mTLS between all services via a service mesh (Istio). A new service is deployed but can't communicate with any other service — all requests fail with "TLS handshake error." What are the most likely causes, and how do you debug them?

## Canonical Sources

- Cloudflare Blog, "An Overview of TLS 1.3" — accessible explanation of the handshake improvements
- SPIFFE documentation (spiffe.io) — the service identity standard
- Let's Encrypt documentation — ACME protocol and automated certificate issuance
- cert-manager documentation (cert-manager.io) — Kubernetes certificate automation