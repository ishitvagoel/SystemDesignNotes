# Module 15: Security & Zero-Trust Architecture

*Securing distributed systems from the wire to the supply chain.*

## Why This Module Matters

Security in distributed systems is fundamentally different from securing a monolith. When you have hundreds of services communicating over a network, every connection is an attack surface. Traditional perimeter security ("hard shell, soft center") fails when an attacker breaches one service and moves laterally. Zero-trust architecture assumes the network is hostile and verifies every request, every time.

This module covers the full security stack: transport security (TLS, mTLS), identity and access control (OAuth2, OIDC, RBAC/ABAC), threat modeling (STRIDE), and the increasingly critical domain of software supply chain security (SLSA, Sigstore).

## Notes in This Module

- [[TLS and Certificate Management]] — TLS 1.3 handshake, mTLS for service-to-service auth, SPIFFE/SPIRE identity, certificate rotation at scale with cert-manager
- [[Authentication and Authorization]] — OAuth2/OIDC flows, RBAC vs ABAC vs ReBAC, token management, and the critical difference between authn and authz
- [[Encryption at Rest and in Transit]] — Envelope encryption, KMS architecture, secret management with Vault/SOPS
- [[Threat Modeling for Distributed Systems]] — STRIDE framework, zero-trust principles, attack surface analysis for microservices
- [[Software Supply Chain Security]] — SLSA levels, Sigstore, SBOMs, and protecting your build pipeline from compromise
- [[Zero-Trust Architecture]] — "Never trust, always verify": SPIFFE/SPIRE service identity, mTLS enforcement, OPA policy engine, micro-segmentation, and BeyondCorp reference architecture

## Prerequisites
- [[_Module 02 MOC]] — API design (authentication and authorization are API-layer concerns)
- [[_Module 01 MOC]] — TLS runs on top of TCP; understanding the transport layer helps understand TLS overhead

## Where This Leads
- [[_Module 16 MOC]] — Reliability (security incidents are reliability incidents)
- [[_Module 12 MOC]] — Service decomposition (more services = more security boundaries to manage)
