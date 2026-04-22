# Software Supply Chain Security

## Why This Exists

Your application isn't just your code. It's your code plus hundreds of open-source dependencies, a build system, a CI/CD pipeline, container base images, and deployment tooling. Each link in this chain is an attack surface. The SolarWinds attack (2020) compromised a build pipeline and shipped malicious code to 18,000 organizations through a signed software update. The Log4Shell vulnerability (2021) demonstrated that a single transitive dependency buried six levels deep can create a critical vulnerability in millions of applications.

Supply chain security is now regulatory-mandated. The US Executive Order 14028 (2021) requires federal suppliers to provide SBOMs. The EU Cyber Resilience Act (2024) mandates supply chain security for any software sold in the EU. This isn't optional — it's a compliance requirement.


## Mental Model

Your code is only as secure as the weakest ingredient you put into it. Imagine baking a cake: you write the recipe (your code), but you buy flour, sugar, and eggs from suppliers (open-source dependencies). If one supplier's eggs are contaminated (malicious package), every cake you bake is poisoned — even though your recipe is perfect. Supply chain security means: verifying your suppliers (signed packages, SLSA provenance), inspecting ingredients before use (vulnerability scanning, SBOMs), and securing your kitchen (build pipeline) so nobody can tamper with ingredients between the supplier and the oven. The SolarWinds attack was someone sneaking into the kitchen and adding poison between delivery and baking.

## The Three Pillars

### SBOMs (Software Bill of Materials)

An SBOM is a machine-readable inventory of every component in your software: direct dependencies, transitive dependencies, their exact versions, licenses, and known vulnerabilities.

**Why it matters**: When Log4Shell was disclosed, organizations without SBOMs spent days or weeks manually auditing codebases to answer "are we affected?" Organizations with SBOMs answered in minutes by querying the SBOM for `log4j-core` across all products.

**Two standards**:
- **SPDX** (ISO/IEC 5962): Originally focused on license compliance. Now covers security. Supported by the Linux Foundation.
- **CycloneDX** (OWASP): Purpose-built for security use cases. Supports vulnerability tracking, service dependencies, and hardware components. Generally preferred for security-focused SBOMs.

**Generation**: Build tools generate SBOMs automatically. `syft` (Anchore) scans container images and codebases. `cyclonedx-maven-plugin` generates SBOMs for Java projects. GitHub and GitLab generate dependency graphs that can be exported as SBOMs.

**Consumption**: Vulnerability scanners (Grype, Trivy) consume SBOMs and cross-reference against vulnerability databases (NVD, OSV). CI/CD pipelines reject builds with known critical vulnerabilities.

### SLSA (Supply-chain Levels for Software Artifacts)

SLSA (pronounced "salsa") is a graduated framework that ensures the integrity of build artifacts — proving that the binary you deploy was actually built from the source code you reviewed, by the build system you control, without tampering.

| Level | Requirements | What It Proves |
|-------|-------------|----------------|
| **SLSA 1** | Build process documented, produces provenance metadata | You know how the artifact was built |
| **SLSA 2** | Build runs on a hosted, authenticated build service. Provenance is signed. | The artifact was built by a known system, not a developer's laptop |
| **SLSA 3** | Build service is hardened (isolated, hermetic — no network during build). Source is verified (signed commits). Provenance is non-forgeable. | The artifact matches the source, and no one tampered with the build |

**Why each level matters**:
- Without SLSA 1: A developer builds on their laptop (which might have malware) and uploads the binary. You have no way to verify it matches the source code.
- Without SLSA 2: The CI system builds the artifact, but anyone with CI access could inject a malicious build step. The artifact has no cryptographic proof of its origin.
- Without SLSA 3: The build system has network access, so a supply chain attack could modify dependencies during the build (dependency confusion, typosquatting). Hermetic builds eliminate this.

**Implementation**: GitHub Actions now supports SLSA provenance generation natively. The SLSA Verifier tool checks provenance attestations at deployment time.

### Sigstore (cosign, Rekor, Fulcio)

Traditional code signing requires managing long-lived GPG keys — keys that are stored on developer laptops, shared between team members, rarely rotated, and devastating if compromised. Sigstore replaces this with **ephemeral, identity-based signing**.

**cosign**: Signs container images and other artifacts. Supports **keyless signing** using your OIDC identity (GitHub, Google, Microsoft). You authenticate with your identity provider; Sigstore issues a short-lived certificate, signs the artifact, and records the signature in a transparency log. No long-lived key to manage, lose, or compromise.

**Rekor**: A transparency log — an append-only, publicly auditable ledger that records every signing event. You can verify that a specific artifact was signed at a specific time by a specific identity. Tampering with the log is detectable (Merkle tree integrity).

**Fulcio**: A certificate authority that issues short-lived signing certificates (10 minutes) tied to OIDC identities. The certificate proves "this artifact was signed by alice@company.com at 2024-03-08T14:32:00Z." After 10 minutes, the certificate expires — even if compromised, it's useless.

**The workflow**: Developer pushes code → CI builds the artifact → CI signs with cosign (keyless, using the CI's OIDC identity) → signature recorded in Rekor → deployment pipeline verifies the signature and provenance before deploying.

## Practical Implementation

**Minimum viable supply chain security (start here)**:
1. Generate SBOMs in CI for every build (use `syft` or language-specific tools)
2. Scan SBOMs for known vulnerabilities (Grype, Trivy) — fail the build on critical CVEs
3. Sign container images with cosign in CI
4. Verify signatures at deployment time (Kubernetes admission controller like Kyverno or Sigstore Policy Controller)

**Mature supply chain security (build toward)**:
1. SLSA Level 2+ with signed provenance attestations
2. Hermetic builds (no network access during build)
3. Dependency pinning with hash verification (npm `integrity`, Go `go.sum`, Python `--require-hashes`)
4. Private dependency mirrors (avoid pulling from public registries at build time)
5. Automated dependency update with security review (Renovate, Dependabot)



### The xz Utils Backdoor (2024) — A Watershed Moment

In March 2024, a sophisticated supply chain attack was discovered in xz Utils, a ubiquitous compression library used by virtually every Linux distribution. An attacker ("Jia Tan") spent over two years building trust as a legitimate open-source contributor before inserting a backdoor that would have compromised SSH authentication on millions of servers worldwide.

**Why it matters for system design**: This attack was not a dependency confusion or typosquatting — it was a patient, human-driven social engineering attack on the open-source trust model itself. It demonstrated that even well-maintained, critical infrastructure projects are vulnerable when maintainer trust is exploited. The backdoor was caught only because a Microsoft engineer noticed a 500ms performance regression in SSH — not through any automated security tool.

**Industry response**: The incident accelerated adoption of SLSA provenance, reproducible builds, and maintainer identity verification. It strengthened the argument for hermetic builds (no network during build), multiple-reviewer requirements for critical packages, and funding for open-source security audits.

## Trade-Off Analysis

| Practice | Protection Against | Implementation Cost | Developer Friction | Best For |
|----------|-------------------|--------------------|--------------------|----------|
| Dependency scanning (Dependabot, Snyk) | Known CVEs in dependencies | Low — automated PRs | Low — auto-fix available | Every project — table stakes |
| Lock files + hash verification | Tampered packages, dependency confusion | Trivial — already built into package managers | None | Every project — free protection |
| SBOM generation (SPDX, CycloneDX) | Inventory blindness, audit gaps | Low | None | Compliance, enterprise, government contracts |
| Signed commits + build provenance (SLSA) | Compromised build pipeline, unauthorized changes | Medium — CI/CD changes, key management | Low-Medium | High-security environments, open-source projects |
| Vendoring / mirroring dependencies | Registry outages, left-pad incidents, supply chain attacks | Medium — storage and maintenance | Medium — manual updates | Critical systems, air-gapped environments |
| Reproducible builds | Compromised build environment | High — deterministic toolchains | Medium | Highest-security: crypto wallets, voting systems |

**Layer your defenses**: No single practice is sufficient. The minimum viable supply chain security is: lock files (prevent silent upgrades), automated dependency scanning (catch known CVEs), and signed commits (establish provenance). Add SBOM and SLSA levels as your maturity grows. The 2021 SolarWinds and 2024 xz incidents showed that even sophisticated attackers target the build pipeline, not just the code.

## Failure Modes

- **Dependency confusion**: An attacker publishes a malicious package with the same name as your internal package to a public registry. If your build system checks the public registry before the private one, it pulls the malicious version. Mitigation: configure package managers to use only your private registry for internal packages (npm `@scope`, Python `--index-url` pointing to private Artifactory/Nexus).

- **Typosquatting**: `reqeusts` instead of `requests`. A malicious package with a name similar to a popular package. Mitigation: use lock files with integrity hashes, review dependency additions in code review, scan with tools like Socket.dev.

- **Compromised CI pipeline**: An attacker gains access to your CI system (stolen CI token, vulnerable CI plugin) and injects a malicious build step. The artifact is built by your CI, so SLSA Level 1 provenance doesn't help. Mitigation: SLSA Level 3 (hardened, isolated build environments), audit CI configuration changes, rotate CI credentials.

- **Stale vulnerability data**: Your SBOM scanner uses a vulnerability database that's 48 hours old. A critical zero-day was published 24 hours ago. Mitigation: use real-time vulnerability feeds (OSV.dev), scan continuously (not just at build time), and enable GitHub/GitLab security alerts for repositories.

## Architecture Diagram

```mermaid
graph LR
    subgraph "Source (Trust Boundary 1)"
        Git[Signed Git Commits] --> CI[Hardened CI: GitHub Actions]
    end

    subgraph "Build (Trust Boundary 2 - SLSA)"
        CI --> Build[Build Artifact / Image]
        Build --> Sign[Cosign: Identity-based Sign]
        Build --> SBOM[Generate SBOM: syft]
    end

    subgraph "Registry (Durable Evidence)"
        Sign --> Log[Rekor: Transparency Log]
        Build --> Reg[(Secure Image Registry)]
        SBOM --> Reg
    end

    subgraph "Deploy (Enforcement)"
        Reg --> Gate[Admission Controller]
        Gate -->|Verify Signature| K8s[Production Cluster]
    end

    style Sign fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Gate fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Transitive Depth**: The average modern application has **~10-50 direct** dependencies but **~500-1,000 transitive** ones. 90% of your vulnerabilities will come from transitive dependencies.
- **Vulnerability Response**: A mature team should be able to identify if they are affected by a new CVE across all services in **< 15 minutes** using SBOMs.
- **Signing Speed**: Identity-based signing (Sigstore) takes **< 2 seconds** in a CI pipeline and requires zero manual key management.
- **Audit Cadence**: Scan your production container images for new vulnerabilities **every 24 hours**, even if no new code is deployed.

## Real-World Case Studies

- **SolarWinds (2020)**: This was the ultimate "Build Pipeline" compromise. Attackers injected a backdoor into the **build system** itself, not the source code. The malicious code was then compiled and signed with SolarWinds' legitimate certificate, making it look perfectly valid to 18,000 customers. This incident was the primary driver for the **SLSA** framework.
- **Log4Shell (2021)**: This exposed the "Transitive Dependency" problem. A vulnerability in a common Java logging library allowed remote code execution. Thousands of companies didn't even know they were using Log4j because it was buried several levels deep in other vendors' software, leading to the global mandate for **SBOMs**.
- **xz Utils (2024)**: A sophisticated actor spent **2 years** gaining trust as a maintainer of a low-level library to eventually inject a backdoor. This showed that even "Social Trust" is a part of the supply chain. It proved that **Hermetic Builds** (no network access during build) and **Reproducible Builds** are critical for the highest security tiers.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-15-Security__Threat_Modeling_for_Distributed_Systems]] — Supply chain attacks are a top threat vector (Tampering in STRIDE)
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Deployment_and_Release_Engineering]] — Sigstore and SLSA integrate into CI/CD pipelines
- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Kubernetes_and_Platform_Engineering]] — Admission controllers enforce signature verification at deploy time

## Reflection Prompts

1. Your company builds and deploys 50 microservices. None have SBOMs, signatures, or provenance. A new compliance requirement mandates SLSA Level 2 within 6 months. What's your implementation plan? Where do you start, and what's the order of operations?

2. A developer runs `npm install` and gets a dependency confusion attack — a malicious public package overrides your internal `@company/auth-client` package. How does this happen technically? What changes to your npm configuration and CI pipeline prevent it?

## Canonical Sources

- SLSA documentation (slsa.dev) — the framework specification and levels
- Sigstore documentation (sigstore.dev) — cosign, Rekor, Fulcio
- US Executive Order 14028, "Improving the Nation's Cybersecurity" (2021)
- OWASP CycloneDX specification — the SBOM standard
- Google, "Supply-chain security for Go" (blog post) — practical implementation