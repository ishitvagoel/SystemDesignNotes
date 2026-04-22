# Kubernetes and Platform Engineering

## Why This Exists

Kubernetes is the operating system for distributed applications. It handles container scheduling, service discovery, scaling, rolling deployments, and health management. But Kubernetes is infrastructure-facing — developers shouldn't need to understand YAML manifests, pod scheduling, and ingress controllers to deploy their code. Platform engineering bridges this gap: building Internal Developer Platforms (IDPs) that provide self-service abstractions on top of Kubernetes.


## Mental Model

Kubernetes is a harbor master for container ships. Each container (pod) carries a workload. The harbor master decides which dock (node) each ship uses, reroutes ships if a dock is damaged (self-healing), adds more ships when the port is busy (auto-scaling), and coordinates arrivals so the port never gets overwhelmed (scheduling). You don't talk to individual docks — you tell the harbor master "I need 5 ships carrying web servers, always" (declarative configuration), and the harbor master makes it happen. Platform engineering takes this further: instead of every shipping company learning harbor master protocols, you build a self-service portal where they click "deploy my cargo" and the harbor master handles the rest. The platform is the portal; Kubernetes is the harbor master behind it.

## Kubernetes Architecture (Brief)

**Control plane**: API server (the interface), etcd (the brain — stores all cluster state via [[02-Phase-2-Distribution__Module-09-Consensus__Coordination_Services|Raft consensus]]), scheduler (assigns pods to nodes), controller manager (reconciliation loops that ensure actual state matches desired state).

**Worker nodes**: kubelet (manages pods on the node), container runtime (containerd, CRI-O), kube-proxy (networking rules).

**Key abstractions**: Pods (smallest deployable unit), Deployments (declarative pod management with rolling updates), Services (stable network identity + load balancing), StatefulSets (ordered, persistent workloads), DaemonSets (one pod per node — log collectors, monitoring agents), Jobs/CronJobs (batch workloads).

## Orchestration Patterns

**Sidecar**: A helper container alongside the main container in the same pod. Handles cross-cutting concerns (logging, mTLS proxy, config reload) without modifying the main application. Envoy as a sidecar proxy is the foundation of service meshes ([[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Strangler_Fig_and_Migration_Patterns]]).

**Init container**: Runs before the main container starts. Used for setup tasks: wait for a dependency to be ready, fetch secrets from Vault, run database migrations.

**Service mesh** (Istio, Linkerd): A fleet of sidecar proxies (data plane) managed by a control plane. Provides mTLS, traffic management (canary routing, fault injection), retries, circuit breaking, and observability — all without application code changes. Worth the complexity at 20+ services; overkill for fewer.

## Platform Engineering

### The Problem

Kubernetes is powerful but complex. A developer who wants to deploy a web service must understand Deployments, Services, Ingress, ConfigMaps, Secrets, resource limits, health probes, HPA, PDB, and more. This cognitive load slows teams and creates a class of "Kubernetes experts" that becomes a bottleneck.

### Internal Developer Platforms (IDPs)

An IDP abstracts Kubernetes complexity behind self-service interfaces. Developers interact with the platform through a developer portal, CLI, or API — not raw Kubernetes YAML.

**Five-plane architecture** (from the Platform Engineering community):

1. **Developer plane**: The developer-facing interface. Developer portal (Backstage), CLI, templates.
2. **Integration plane**: Connects to CI/CD, version control, artifact registries.
3. **Resource plane**: Provisions infrastructure (databases, caches, queues) via self-service.
4. **Monitoring plane**: Observability, alerting, SLO dashboards per service.
5. **Security plane**: Identity, secrets, network policies, compliance.

**Backstage** (Spotify, now CNCF): The standard developer portal framework. Software catalog (what services exist, who owns them, their docs), templates (scaffold a new service with best practices pre-configured — "golden paths"), TechDocs (documentation as code), and plugins (integrate CI/CD, monitoring, cost tracking).

### Platform as a Product

Treat the platform team's internal customers (developers) like a product team treats its users. Measure developer experience: time from "I want a new service" to "it's in production," frequency of platform support tickets, developer satisfaction surveys.

**Golden paths**: Pre-built, opinionated templates for common workloads. "Deploy a REST API" → scaffold includes: Dockerfile, Helm chart, CI/CD pipeline, monitoring dashboards, SLO alerts, Backstage catalog entry. Developers follow the golden path by default; they can deviate when needed but rarely need to.

**Self-service infrastructure**: Developers request a database via a portal form or API call. The platform provisions it (via Terraform, Crossplane, or cloud APIs), configures backups, monitoring, and access credentials, and delivers connection details — without a ticket to the infrastructure team.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Internal Developer Platform (IDP)"
        Portal[Developer Portal: Backstage] -->|1. Scaffold| Git[Git Repository]
        Portal -->|2. Provision| IAC[Infrastructure as Code]
    end

    subgraph "Control Plane (The Brain)"
        K8s_API[K8s API Server] --> etcd[(etcd: Raft Store)]
        K8s_API --> Sched[Scheduler]
        K8s_API --> Ctrl[Controller Manager]
    end

    subgraph "Data Plane (The Fleet)"
        K8s_API --> Node1[Worker Node 1]
        K8s_API --> Node2[Worker Node 2]
        
        subgraph "Pod (Smallest Unit)"
            Node1 --- Pod[App Container + Sidecar Proxy]
        end
    end

    Git -->|3. CI/CD| K8s_API
    IAC -->|4. Cloud API| Cloud[AWS / GCP Resources]

    style Portal fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style etcd fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Break-even Point**: Adopting Kubernetes typically pays off when you reach **> 10 independent microservices** or **> 20 engineers**. Below this, the "K8s Tax" (YAML complexity, cluster management) often outweighs the benefits.
- **Resource Requests**: Set `requests` to the **p50 - p75** of your actual usage. Set `limits` to **p99**. If `requests == limits`, you are wasting money; if `limits` are too low, you hit OOMKills.
- **Node Density**: Aim for **10 - 20 pods per node**. Too few pods wastes money on base OS overhead; too many pods risks massive blast radius if a node fails.
- **Sidecar Overhead**: A service mesh sidecar (Envoy) adds **~1ms - 5ms** latency and **~50MB - 100MB** RAM per pod. Multiply this by your total pod count to see your "Mesh Tax."

## Real-World Case Studies

- **Spotify (Backstage Origins)**: Spotify created **Backstage** because they reached a point where developers couldn't find their own services. With over 2,000 microservices, the "Scaffold" feature allowed a new engineer to go from "Idea" to "Hello World in Production" in **less than 5 minutes**, following all company security and observability best practices automatically.
- **Chick-fil-A (Kubernetes at the Edge)**: Chick-fil-A runs a 3-node Kubernetes cluster **inside every restaurant**. They use it to manage local IoT devices (fryers, ovens) and ensure that even if the restaurant loses internet connection, the local "Platform" keeps the store running. This is an extreme example of Kubernetes used for high availability in a decentralized environment.
- **Adobe (Internal Developer Platform)**: Adobe built an IDP on top of Kubernetes that serves over 5,000 developers. They found that by providing "Golden Paths" (pre-approved templates), they could automate **90% of security compliance checks**, allowing product teams to focus entirely on feature code while the platform team handled the underlying K8s complexity.

## Connections

- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Serverless_and_Edge_Computing]] — Kubernetes vs serverless: K8s for persistent workloads, serverless for event-driven
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Deployment_and_Release_Engineering]] — K8s enables blue-green, canary, and GitOps deployments natively
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — Platform engineering includes per-service observability setup
- [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Strangler_Fig_and_Migration_Patterns]] — Sidecar pattern and service mesh are K8s-native

## Canonical Sources

- Kubernetes documentation (kubernetes.io) — the authoritative reference
- Backstage documentation (backstage.io) — the standard developer portal framework
- *Team Topologies* by Skelton & Pais — the organizational model behind platform teams
- *Designing Distributed Systems* by Brendan Burns (2nd ed, 2024) — container patterns, K8s architecture, and AI workload scheduling

## Trade-Off Analysis

| Approach | Operational Complexity | Flexibility | Cost Efficiency | Best For |
|----------|----------------------|-------------|-----------------|----------|
| Bare VMs | Low initially, high at scale | Maximum | High (no overhead) | Small teams, simple apps |
| Managed K8s (EKS/GKE/AKS) | Medium | High | Medium (control plane costs) | Most production workloads |
| Self-managed K8s | Very high | Maximum | High (if you have the team) | Specific compliance/customization needs |
| Serverless (Lambda) | Very low | Low | Variable (cheap at low scale) | Event-driven, sporadic workloads |
| PaaS (Heroku, Railway) | Very low | Low | Low at small scale | Prototypes, small teams |
| Internal Developer Platform on K8s | High to build, low to use | High (curated) | Medium | Large engineering orgs (50+ devs) |

**The K8s complexity tax**: Kubernetes solves real problems — service discovery, rolling deploys, auto-scaling, self-healing — but at the cost of a steep learning curve and operational overhead. The break-even point is roughly 10+ services with a dedicated platform team. Below that, simpler solutions often win.

## Failure Modes

**etcd failure**: etcd is K8s's brain. If etcd loses quorum, the control plane is down — no new deploys, no scaling, no self-healing. Running workloads continue but can't be managed. Solution: run etcd with 3+ nodes across availability zones, regular backups, and monitor etcd latency/disk usage closely.

**Node pressure evictions**: When a node runs low on memory or disk, the kubelet evicts pods by priority. If critical pods don't have proper priority classes and resource requests, they can be evicted. Solution: always set resource requests and limits, use PriorityClasses, and configure pod disruption budgets.

**Misconfigured resource limits**: Setting CPU limits too low causes throttling (the pod runs slow). Setting memory limits too low causes OOMKill (the pod is killed). Not setting limits at all allows one pod to consume the entire node. Solution: profile actual resource usage, set requests = typical usage, limits = peak usage.

**Service mesh overhead**: Envoy sidecars add ~10ms p99 latency and ~50MB memory per pod. At 1000 pods, that's 50GB of memory just for sidecars. Solution: evaluate whether you actually need a mesh (most teams under 50 services don't), and consider ambient mesh (Istio ambient) which removes sidecars.

**Upgrade failures**: K8s releases quarterly. Skipping versions is not supported. An upgrade can break CRDs, admission webhooks, or deprecated APIs. Solution: maintain a staging cluster that mirrors production, test upgrades there first, and use tools like Pluto to detect deprecated APIs.

**Platform engineering pitfall — building too much**: Platform teams can spend years building an IDP that product teams don't actually want. Solution: start with the highest-pain developer workflows (deploy, observe, rollback), build the minimal platform, iterate based on actual developer feedback, and treat the platform as an internal product.

## Reflection Prompts

1. Your company has 8 microservices and 4 backend engineers. The CTO wants to adopt Kubernetes. Make the case for and against. What's the minimum viable alternative that solves their actual problems?
2. Design a pod resource configuration for a Java service that uses 2GB heap + 500MB off-heap under normal load and spikes to 3.5GB during GC. What are your requests and limits? What happens if you get them wrong?
3. You're building an internal developer platform. Product teams want: one-click deploys, environment provisioning, and log access. What's the minimal set of tools you'd assemble? What would you explicitly NOT build in v1?

## Canonical Sources

- Brendan Burns et al., *Designing Distributed Systems* (2nd ed, 2024)
- Kelsey Hightower, "Kubernetes the Hard Way" — https://github.com/kelseyhightower/kubernetes-the-hard-way
- Team Topologies (Skelton & Pais, 2019) — The organizational model behind platform engineering
- CNCF Platforms White Paper (2024) — Platform engineering maturity model
- Kubernetes Documentation — https://kubernetes.io/docs/
