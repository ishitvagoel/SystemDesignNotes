# Module 15: Security & Zero-Trust Architecture

*Securing distributed systems from the wire to the supply chain.*

## Why This Module Matters

Security in distributed systems is fundamentally different from securing a monolith. When you have hundreds of services communicating over a network, every connection is an attack surface. Traditional perimeter security ("hard shell, soft center") fails when an attacker breaches one service and moves laterally. Zero-trust architecture assumes the network is hostile and verifies every request, every time.

This module covers the full security stack: transport security (TLS, mTLS), identity and access control (OAuth2, OIDC, RBAC/ABAC), threat modeling (STRIDE), and the increasingly critical domain of software supply chain security (SLSA, Sigstore).

## Notes in This Module

- [[03-Phase-3-Architecture-Operations__Module-15-Security__TLS_and_Certificate_Management]] — TLS 1.3 handshake, mTLS for service-to-service auth, SPIFFE/SPIRE identity, certificate rotation at scale with cert-manager
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization]] — OAuth2/OIDC flows, RBAC vs ABAC vs ReBAC, token management, and the critical difference between authn and authz
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Encryption_at_Rest_and_in_Transit]] — Envelope encryption, KMS architecture, secret management with Vault/SOPS
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Threat_Modeling_for_Distributed_Systems]] — STRIDE framework, zero-trust principles, attack surface analysis for microservices
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Software_Supply_Chain_Security]] — SLSA levels, Sigstore, SBOMs, and protecting your build pipeline from compromise
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Zero_Trust_Architecture]] — "Never trust, always verify": SPIFFE/SPIRE service identity, mTLS enforcement, OPA policy engine, micro-segmentation, and BeyondCorp reference architecture

## Prerequisites
- [[Module_Module_02_MOC]] — API design (authentication and authorization are API-layer concerns)
- [[Module_Module_01_MOC]] — TLS runs on top of TCP; understanding the transport layer helps understand TLS overhead

## Where This Leads
- [[Module_Module_16_MOC]] — Reliability (security incidents are reliability incidents)
- [[Module_Module_12_MOC]] — Service decomposition (more services = more security boundaries to manage)
