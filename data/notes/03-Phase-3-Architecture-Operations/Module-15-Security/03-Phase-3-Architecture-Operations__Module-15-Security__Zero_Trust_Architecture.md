# Zero-Trust Architecture

## Why This Exists

The traditional network security model is "castle-and-moat": a hard perimeter (firewalls, VPNs) keeps attackers out, and everything inside the perimeter is trusted implicitly. This model has two fatal flaws in modern distributed systems: (1) the perimeter doesn't exist anymore — services run on multi-cloud, endpoints are laptops on coffee shop WiFi, APIs are exposed externally; and (2) perimeter breach = total compromise — once an attacker is inside, they can move laterally to every service, because nothing inside the network requires authentication.

Zero-trust architecture replaces "trust the network" with **"never trust, always verify."** Every request — regardless of where it originates (internal or external, user or service) — must be authenticated, authorized, and encrypted. A compromised service can only access what it's explicitly permitted to; it cannot pivot to adjacent systems by virtue of being "on the internal network."

Zero-trust is not a product you buy. It's an architectural philosophy implemented through a combination of strong identity, mutual authentication, fine-grained authorization, and continuous verification.

## Mental Model

The old model: your office building has a security guard at the front door. Once you're inside, you can walk into any room freely — the guard's judgment at the door is the only protection. If someone tailgates through a locked door, they have access to everything.

Zero-trust: every room in the building has its own badge reader. Your badge proves who you are. Each door decides, based on your identity and role, whether to let you in — independently of how you got into the building. The hallway itself doesn't confer access. Even if an attacker follows you into the lobby, they can't open any doors your badge doesn't authorize.

In distributed systems: the network (the hallway) provides zero implicit trust. Service identity (the badge) is cryptographic. Every service call is authenticated and authorized at the target (the badge reader), not just at the perimeter (the front door).

## The Five Pillars of Zero-Trust

### 1. Strong Identity for Everything
Every **user** and every **service** has a verifiable, cryptographic identity. Usernames+passwords are insufficient; cryptographic credentials (certificates, hardware-bound tokens) are required.

For services: **SPIFFE (Secure Production Identity Framework for Everyone)** defines a standard service identity format — the **SVID (SPIFFE Verifiable Identity Document)** — encoded as an X.509 certificate (x509-SVID) or JWT (jwt-SVID). The SPIFFE ID is a URI: `spiffe://trust-domain/workload/path`.

**SPIRE** (SPIFFE Runtime Environment) implements SPIFFE: it attests workload identity using node attestation (TPM, cloud provider metadata) and workload attestation (process UID, Kubernetes pod labels). Once attested, SPIRE issues short-lived SVIDs (typically 1-hour TTL) and auto-rotates them — services never see long-lived credentials.

### 2. Mutual TLS (mTLS) Everywhere
Standard TLS: the client verifies the server's certificate. mTLS: **both** sides present certificates. The server verifies the client's identity, not just the channel security.

In a zero-trust microservice mesh:
- Every service presents its SPIFFE SVID as its TLS client certificate
- Every service validates the server's SVID before sending data
- "Service A is allowed to call Service B" is enforced by Service B's authorization policy, which checks Service A's SVID

This eliminates IP-based trust ("I allow calls from 10.0.0.0/8") and replaces it with identity-based trust ("I allow calls from `spiffe://prod.example.com/service-a`").

### 3. Fine-Grained Authorization
Authentication (who are you?) is necessary but not sufficient. Authorization (what are you allowed to do?) must be enforced at every service, for every request.

**Policy engines**:
- **OPA (Open Policy Agent)**: A general-purpose policy engine. Policies are written in Rego (a declarative language). OPA evaluates `input` (the request: caller identity, requested resource, action) against `policy` (rules) and returns `allow/deny`. Services call OPA's HTTP API synchronously, or embed the OPA library for microsecond-latency evaluation.
- **Cedar** (AWS): A more structured policy language designed specifically for authorization (simpler than Rego for RBAC/ABAC patterns, with formal verification support).

**Policy example** (OPA/Rego):
```rego
allow {
    input.caller.spiffe_id == "spiffe://prod/order-service"
    input.action == "read"
    input.resource.type == "payment"
}
```
This policy says: Order-Service can read payment records. If Payment-Service receives a call from any other identity, the policy denies it — even if the caller is authenticated.

### 4. Micro-Segmentation
In the old model, the network is flat: any service can attempt to connect to any other service. Micro-segmentation enforces **network policies** that restrict which services can even attempt to connect.

In Kubernetes: **NetworkPolicy** objects restrict pod-to-pod traffic. Only pods matching the allowed ingress selectors can open connections to a pod. An attacker who compromises a frontend pod cannot connect to the database pod, because the network policy allows only the backend pod to establish that connection.

With a service mesh (Istio, Linkerd, Cilium): micro-segmentation is enforced at L4 (TCP connection allowed/denied) or L7 (specific HTTP paths/methods allowed/denied) based on service identity — independent of IP addresses.

### 5. Continuous Verification and Least Privilege
Zero-trust assumes breach. Even authenticated, authorized services are monitored continuously:
- **Short-lived credentials**: SVIDs with 1-hour TTL mean a compromised credential is worthless within an hour. No long-lived API keys.
- **Audit logging**: Every authentication and authorization decision is logged. Who called what, when, from where — immutable audit trail.
- **Anomaly detection**: Behavioral baselines (service A normally makes 100 calls/second to service B; a spike to 10,000 triggers an alert).
- **Least privilege**: Service A only receives the SVID that authorizes the calls it needs to make. It cannot request a broader identity at runtime.

## Trade-Off Analysis

| Approach | Security | Operational Complexity | Performance Overhead | Migration Cost |
|----------|----------|----------------------|---------------------|----------------|
| **Perimeter-only** | Low (lateral movement risk) | Low | None | None (existing) |
| **mTLS + SPIRE** | High | Medium (cert rotation automation needed) | 0.5–2ms per call (TLS handshake amortized) | High (instrument all services) |
| **Service Mesh (Istio)** | High | High (Envoy sidecars) | 1–5ms per hop | Medium (inject sidecars) |
| **Cilium eBPF** | High | Medium | < 0.5ms | Medium (replace kube-proxy) |
| **Network Policies only** | Medium (L4 only) | Low | None | Low |

**The amortization insight**: mTLS handshake overhead (1–3ms) is paid once per connection, not per request. With HTTP/2 multiplexing or connection pooling, thousands of requests share a single TLS session — overhead drops to microseconds per request.

## Failure Modes & Production Lessons

**1. Certificate rotation causing service outages**
A service's SVID expires at 9am. The rotation job failed silently at 8:55am. At 9am, all connections to this service fail with "certificate expired." Mitigation: alert when SVIDs reach 80% of their TTL without renewal; implement retry logic for certificate-expired errors (the SPIRE agent will deliver a fresh cert within seconds); use canary deployment for SPIRE upgrades.

**2. Authorization policy too permissive during initial rollout**
Teams set policies to `allow` everything initially to "not break anything," intending to tighten later. "Later" never comes. The zero-trust system is deployed but provides no security benefit. Mitigation: start with audit mode (log denies, don't enforce), review logs for 2 weeks to understand the actual call graph, then enable enforcement with the documented access patterns.

**3. IP-based allowlists survive the migration**
Zero-trust is deployed but old firewall rules with IP-based allowlists still exist. An attacker who compromises a VM with an allowed IP can bypass the identity-based controls. Mitigation: zero-trust migration must include explicit cleanup of legacy IP-based rules; track them in a registry and set hard removal deadlines.

**4. Workload attestation bypassed**
SPIRE attests workload identity using Kubernetes pod labels. An engineer with `kubectl` access can add the right labels to a pod they control, causing SPIRE to issue an SVID for a different service's identity. Mitigation: Kubernetes RBAC must restrict who can create/modify pods in production namespaces; consider node-level attestation (TPM) for higher assurance.

**5. Policy evaluation latency spikes under load**
OPA is deployed as a sidecar. Under peak load, OPA consumes 20% of the pod's CPU for policy evaluation. Mitigation: use OPA's bundle API to cache policies locally (eliminates remote calls); use partial evaluation to pre-compute decisions for common patterns; alternatively, use Envoy's native RBAC filter for L7 policy without a separate policy engine.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Trust["Control Plane (Zero-Trust Infrastructure)"]
        SPIRE["SPIRE Server\n(identity authority)"]
        OPA["OPA / Policy Engine\n(authorization)"]
        Audit["Audit Log\n(immutable)"]
    end

    subgraph ServiceA["Service A Pod"]
        AppA["App A"]
        SVID_A["SPIRE Agent\n(SVID: spiffe://prod/svc-a)"]
    end

    subgraph ServiceB["Service B Pod"]
        AppB["App B"]
        SVID_B["SPIRE Agent\n(SVID: spiffe://prod/svc-b)"]
    end

    SPIRE --> |"Issue SVID (1h TTL)"| SVID_A
    SPIRE --> |"Issue SVID (1h TTL)"| SVID_B

    AppA --> |"Call API"| AppB
    SVID_A <--> |"mTLS: present SVID"| SVID_B
    AppB --> |"Authz: can svc-a call /api/pay?"| OPA
    OPA --> |"allow / deny"| AppB
    AppB --> |"Log decision"| Audit

    NetPol["Kubernetes NetworkPolicy\n(L4 micro-segmentation)"] --> |"Block unauthorized connections"| ServiceA
    NetPol --> ServiceB

    style Trust fill:var(--surface),stroke:var(--accent),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **SVID TTL**: 1 hour is the common default. At 1,000 services, SPIRE rotates ~17 SVIDs per minute — negligible load.
- **mTLS handshake overhead**: 1–3ms for the initial handshake (TLS 1.3 with session resumption). With HTTP/2 connection reuse, amortized to ~5µs per request at 200 requests per long-lived connection.
- **OPA evaluation latency**: 1–5ms for a remote OPA call; < 100µs with OPA embedded (in-process or sidecar with local cache). For high-RPS services, embed OPA.
- **Envoy sidecar overhead**: 1–5ms per hop in a service mesh. At 10 service hops per user request, that's 10–50ms added to p99 latency — significant for latency-sensitive paths. Mitigate with eBPF-based service meshes (Cilium) which have < 0.5ms overhead.
- **Certificate store size**: 1,000 services × 3 certificates per service (SVID + intermediates) × 2 KB each = ~6 MB in memory. Well within the range of any service instance.
- **Lateral movement blast radius reduction**: With zero-trust, a compromised service can only reach services it's authorized to call. If each service can call 5 of 1,000 services, a breach exposes 0.5% of the attack surface vs 100% in the perimeter model.

## Real-World Case Studies

- **Google (BeyondCorp)**: Google implemented zero-trust internally in 2011 after Aurora (a state-sponsored attack that exploited the implicit trust of the internal network). BeyondCorp moved all access decisions to an access proxy based on device posture and user identity — not network location. By 2017, Google employees worked from untrusted networks (coffee shops, home) with the same access controls as from the office. BeyondCorp is now the reference architecture for enterprise zero-trust.

- **Cloudflare (Cloudflare Access + mTLS)**: Cloudflare uses SPIFFE/SPIRE to issue service identities across their global edge network. Their "mTLS for service-to-service" policy means a compromised edge node in one region cannot call core infrastructure services — it only has the SVID that authorizes the specific calls its workload type needs. They publish their zero-trust architecture as Cloudflare Access for other organizations.

- **Square/Block (Service-to-Service mTLS)**: Block (formerly Square) mandates mTLS for all internal service communication. When they migrated from IP-based firewall rules to SPIFFE-based identity, they discovered 12 undocumented service-to-service call paths that violated their intended architecture — paths that were invisible under the IP-based model but became explicit under identity-based access control. Zero-trust surfaced architectural drift as a side effect of enforcement.

## Connections

- [[Authentication and Authorization]] — User identity (OAuth2/OIDC) and service identity (mTLS/SPIFFE) are complementary layers
- [[TLS and Certificate Management]] — mTLS is the transport mechanism; SPIFFE/SPIRE is the identity framework on top of it
- [[Threat Modeling for Distributed Systems]] — Zero-trust addresses lateral movement threats (STRIDE: Elevation of Privilege, Spoofing)
- [[gRPC Deep Dive]] — gRPC interceptors enforce mTLS and SVID validation for every service call
- [[eBPF and Kernel Observability]] — eBPF LSM hooks provide the enforcement plane for network micro-segmentation and runtime security policy

## Reflection Prompts

1. Your company runs 200 microservices. Currently, all internal traffic is allowed on the private VPC (perimeter model). You want to implement zero-trust. Your CISO wants full enforcement in 6 months. Outline your migration plan: what do you implement first, what runs in "audit mode" vs. "enforcement mode," and what's the biggest risk if you rush?

2. A security researcher reports that Service X can call Service Y's admin endpoint — even though no documented use case requires that call. Describe exactly why this vulnerability would be prevented in a zero-trust architecture with SPIFFE + OPA, and why it's exploitable in a perimeter-only model.

3. You're evaluating two zero-trust implementations: (a) Istio service mesh with Envoy sidecars and (b) Cilium with eBPF. Both enforce mTLS and network policies. What are the latency, operational complexity, and security trade-offs? For which scenario would you choose each?

## Canonical Sources

- Google, "BeyondCorp: A New Approach to Enterprise Security" (2014) — the original paper
- NIST SP 800-207, "Zero Trust Architecture" (2020) — the government standard definition
- SPIFFE project documentation (spiffe.io) — SVID specification and SPIRE implementation guide
- OPA documentation (openpolicyagent.org) — Rego language and decision logging
- Cloudflare Blog, "Zero Trust, SASE, and SSE" — practical implementation insights
