# Encryption at Rest and in Transit

## Why This Exists

Data exists in three states: **in transit** (moving between services), **at rest** (stored on disk), and **in use** (being processed in memory). If an attacker intercepts network traffic, they get data in transit. If they steal a disk or compromise a backup, they get data at rest. Encryption ensures that even with the raw bytes, an attacker can't read them without the key.

This isn't theoretical. Capital One's 2019 breach exposed 100 million records from improperly secured S3 buckets. The 2023 Microsoft Storm-0558 incident exploited a signing key compromise. Key management is the linchpin — encryption is only as strong as how you manage the keys.


## Mental Model

Encryption in transit is an armored truck — the data is protected while it's moving between locations, but once it arrives and is unloaded, it's in the open. Encryption at rest is a vault — the data is protected while it's sitting in storage, but when you take it out to use it, it's in the open. You need both: the armored truck (TLS) protects data on the network, and the vault (AES encryption + KMS) protects data on disk. Envelope encryption is the clever trick of locking the vault with a key, then locking that key in a smaller, more secure vault (KMS) — so you never have to move the big key around, only the small one.

## Encryption in Transit

Every network communication uses TLS 1.3 (see [[03-Phase-3-Architecture-Operations__Module-15-Security__TLS_and_Certificate_Management]]). Internal service-to-service traffic uses mTLS — both sides present certificates. The era of "plaintext inside the VPC is fine" is over; zero-trust architectures encrypt everything.

**The common gap**: Database connections. Many applications connect to Postgres or MySQL over plaintext within a VPC. If an attacker gains VPC access (cloud misconfiguration makes this more common than people think), they can sniff queries and results. Mitigation: `sslmode=require` (Postgres) or `require_secure_transport=ON` (MySQL).

## Encryption at Rest: Envelope Encryption

The standard pattern used by AWS KMS, Google Cloud KMS, and Azure Key Vault:

**The problem with direct encryption**: Encrypting 10TB directly with a master key means the key must be available for every read/write. If compromised, all data is exposed. Rotating the key means re-encrypting 10TB.

**The envelope solution**:
1. Generate a random **Data Encryption Key (DEK)** — one per object, table, or partition.
2. Encrypt the data with the DEK locally — fast, no network call.
3. Encrypt the DEK with a **Key Encryption Key (KEK)** in the KMS. The KEK never leaves the KMS hardware.
4. Store the encrypted DEK alongside the encrypted data. Discard the plaintext DEK.

**Why this works**: The KEK can't be extracted even by the cloud provider (it lives in a hardware security module). Rotating the KEK means re-encrypting only the DEKs (a few hundred bytes), not terabytes of data. Compromising one DEK exposes only its data — not everything.

### Transparent vs Application-Level Encryption

| Approach | Protects Against | Can't Protect Against | Complexity |
|----------|-----------------|----------------------|------------|
| **Transparent** (EBS, TDE, S3 SSE) | Physical disk theft | Attacker with DB query access | Config only |
| **Application-level** (field encryption) | Disk theft AND unauthorized DB queries | Attacker with application access | High — encrypted fields can't be indexed or searched |
| **Client-side** (pre-upload) | Cloud provider seeing plaintext | Key compromise on client side | High |

**Practical guidance**: Transparent encryption for everything (it's free with cloud storage). Application-level encryption for PII and financial fields. Client-side for the most sensitive data (you don't trust the cloud provider with plaintext).

## Secret Management

Application secrets — database passwords, API keys, encryption keys — are the keys to the kingdom.

### Anti-Patterns

**Secrets in code**: `password = "hunter2"` committed to Git. Visible in history forever. The #1 cause of secret compromise.

**Secrets in environment variables**: Better than code, but visible in `/proc/*/environ`, often logged in debug output, and leaked in crash dumps.

### The Solution: HashiCorp Vault

**Dynamic secrets**: Instead of a long-lived database password, Vault generates a fresh credential per request with a short TTL (1 hour). Compromise of one credential is time-limited. No manual rotation.

**Encryption as a service (Transit engine)**: Applications send plaintext to Vault; Vault returns ciphertext. The application never handles encryption keys. Key rotation is transparent.

**Audit logging**: Every secret access is logged. "Who accessed the production DB password at 3am?" is answerable.

**Kubernetes integration**: External Secrets Operator syncs secrets from Vault into Kubernetes Secrets. Sealed Secrets encrypt secrets with a cluster public key — safe to store in Git (GitOps-compatible). Native Kubernetes Secrets are base64-encoded (NOT encrypted) by default — anyone with etcd access reads everything.

## Trade-Off Analysis

| Encryption Approach | Key Management | Performance Impact | Protection Scope | Best For |
|--------------------|---------------|-------------------|-----------------|----------|
| TDE (Transparent Data Encryption) | Database-managed | Low — minimal CPU overhead | Disk theft, backup theft | Compliance checkboxes, database-level encryption |
| Application-level encryption | Application-managed | Moderate — encrypt/decrypt per operation | End-to-end — data encrypted even from DB admins | Sensitive PII, multi-tenant data isolation |
| Envelope encryption (KMS) | Cloud KMS manages master key, app manages data key | Low — data key cached locally | Full — master key never leaves KMS | AWS/GCP/Azure workloads, key rotation |
| Client-side encryption | Client-managed | Moderate | Maximum — service never sees plaintext | Zero-knowledge architectures, E2EE messaging |
| Filesystem encryption (LUKS, dm-crypt) | OS-managed | Minimal | Disk theft | Laptops, physical server security |

**Envelope encryption is the pattern to know**: You don't encrypt data directly with a master key. Instead: (1) generate a data encryption key (DEK), (2) encrypt data with the DEK, (3) encrypt the DEK with the master key (KEK) from KMS, (4) store the encrypted DEK alongside the data. This lets you encrypt large volumes without sending all data to KMS, and rotating the master key only re-encrypts DEKs (small), not all data (huge).

## Failure Modes

- **KMS outage**: Can't decrypt DEKs → can't read data. Mitigation: cache decrypted DEKs briefly in memory, use multi-region KMS.
- **Key deletion**: Someone deletes a KMS key. All data encrypted with it is permanently unrecoverable. Mitigation: enable deletion protection, require multi-party approval, maintain a key inventory.
- **Secret sprawl**: Secrets scattered across env vars, config files, Vault, AWS Secrets Manager, and hardcoded in legacy services. Nobody knows where all secrets are. Mitigation: centralize in one system, audit all access.
- **Rotation failure**: An automated key rotation runs, but one service still uses the old key. Its requests fail. Mitigation: support both old and new keys during a grace period (dual-key window), monitor for rotation-related errors.

## Reflection Prompts

1. Your application stores credit card numbers in Postgres with EBS encryption (transparent). A compliance audit requires "field-level encryption." What changes? How do you handle existing plaintext data? Can you still search by card number after encrypting?

2. A developer commits an AWS access key with admin privileges to a public GitHub repo. Walk through your response in the first 5 minutes, 30 minutes, and 24 hours.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Encryption in Transit (TLS 1.3)"
        User[Client] -->|HTTPS| ALB[Application Load Balancer]
        ALB -->|mTLS| App[App Service]
        App -->|SSL/TLS| DB[(Database)]
    end

    subgraph "Encryption at Rest (Envelope Pattern)"
        subgraph "KMS (Trusted Environment)"
            KEK[Key Encryption Key - Master]
        end
        
        App2[App Service] -->|1. Request DEK| KMS
        KMS -->|2. Plain DEK + Encrypted DEK| App2
        App2 -->|3. Encrypt Data| Data[Plaintext Data]
        Data --> Cipher[Ciphertext]
        App2 -->|4. Store| Storage[(S3 / EBS)]
        Storage --- Cipher
        Storage --- E_DEK[Encrypted DEK]
    end

    style KEK fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Cipher fill:var(--surface),stroke:var(--accent2),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **AES-256 Overhead**: Modern CPUs have hardware acceleration (AES-NI). Encryption typically adds **< 1% CPU overhead**.
- **KMS Latency**: A network call to a cloud KMS (e.g., AWS KMS) takes **~5ms - 20ms**. Use **Data Key Caching** to avoid calling KMS on every operation.
- **Key Rotation**: Rotate Master Keys (KEKs) **annually**. DEKs are effectively "rotated" with every new object or row.
- **Searchability**: Encrypted fields cannot be searched using `WHERE field = 'value'` without using **Deterministic Encryption** or a **Searchable Encryption** scheme, both of which have security trade-offs.

## Real-World Case Studies

- **Capital One (2019 Breach)**: An attacker exploited a misconfigured WAF to gain access to an EC2 instance, which then had permissions to call the **KMS Decrypt** API for millions of records in S3. This highlighted that encryption is useless if the **IAM Roles** governing access to the keys are too permissive.
- **WhatsApp (End-to-End Encryption)**: WhatsApp uses the **Signal Protocol** for encryption in transit. Unlike standard TLS, the keys are generated and stored only on the users' devices. WhatsApp servers only act as a blind relay, meaning they couldn't decrypt messages even if they were served with a government warrant.
- **Adobe (The "Hint" Leak)**: Adobe famously suffered a breach where they used symmetric encryption with the same key for all passwords. Even worse, they stored "password hints" in plaintext. Researchers were able to use the hints to reverse-engineer the encrypted passwords, proving that **Application-Level Encryption** requires careful salt and key management to be effective.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-15-Security__TLS_and_Certificate_Management]] — TLS is encryption in transit; this note covers the key management and at-rest side
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization]] — Secrets (API keys, tokens) are a form of encrypted credential managed by the systems described here
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Threat_Modeling_for_Distributed_Systems]] — Information disclosure (STRIDE) is the primary threat encryption mitigates
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Object_Storage_Fundamentals]] — S3 server-side encryption (SSE-S3, SSE-KMS, SSE-C) uses the envelope encryption pattern described here
- [[03-Phase-3-Architecture-Operations__Module-18-Multitenancy-Geo-Cost__Multi-Tenancy_and_Isolation]] — Per-tenant encryption keys provide cryptographic isolation between tenants
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Software_Supply_Chain_Security]] — Signing keys for artifacts and containers rely on the same KMS and key management practices

## Canonical Sources

- AWS KMS documentation, "Envelope Encryption" — the definitive explanation
- HashiCorp Vault documentation — dynamic secrets, transit engine, PKI
- OWASP Cryptographic Storage Cheat Sheet — practical field-level encryption guidance