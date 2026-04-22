# Module 17: Observability, Deployment & Release Engineering

*Seeing what's happening and shipping changes safely.*

## Why This Module Matters

You can't fix what you can't see, and you can't improve what you can't deploy. These two disciplines — observability and deployment — are the operational backbone of any production system. Observability tells you whether your system is healthy, where it's slow, and why it's broken. Deployment engineering determines whether a code change reaches users safely or takes down production.

Modern deployment has evolved far beyond "push to prod and pray." Progressive delivery (canary, blue-green, feature flags), GitOps (declarative infrastructure from version control), and automated rollback form a deployment pipeline that's both fast and safe.

## Notes in This Module

- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — The three pillars (metrics, logs, traces), OpenTelemetry as the convergence standard, eBPF-powered deep observability, burn-rate alerting, and why dashboards are not observability
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Distributed_Tracing_Deep_Dive]] — Span data model, context propagation (W3C traceparent), OpenTelemetry collector architecture, head-based vs tail-based vs adaptive sampling, trace storage backends, and cardinality pitfalls
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__eBPF_and_Kernel_Observability]] — eBPF program types (kprobe, XDP, LSM), the verifier safety model, BPF maps, CO-RE portability, and production use cases (Cilium, Parca, Falco, Cloudflare XDP)
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Feature_Flags_and_Safe_Deployment]] — Flag types, evaluation semantics, progressive delivery integration, stale flag cleanup, and circuit breaker interaction
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Deployment_and_Release_Engineering]] — Blue-green, canary, feature flags, progressive delivery, GitOps with ArgoCD/Flux, automated rollback strategies, and the critical difference between deployment and release

## Prerequisites
- [[Module_Module_16_MOC]] — SLOs drive alerting strategy; reliability patterns determine what to monitor
- [[Module_Module_12_MOC]] — Microservices multiply the deployment and observability surface area

## Where This Leads
- [[Module_Module_18_MOC]] — Cost engineering requires cost observability; geo-distribution requires deployment across regions
- [[Module_Module_16_MOC]] — Chaos engineering tests require observability to validate hypotheses
