# Module 21: Serverless, Edge & Platform Engineering

*The infrastructure abstraction frontier — from zero-management compute to self-service platforms.*

## Why This Module Matters

The infrastructure layer is evolving toward two extremes simultaneously. On one end, serverless and edge computing push computation closer to users and abstract away servers entirely — you write functions, the platform handles everything else. On the other end, Kubernetes and platform engineering provide powerful but complex orchestration for teams that need full control.

Understanding both extremes — and the trade-offs between them — is essential for modern system design. When should you go serverless? When does Kubernetes justify its complexity? Where does edge compute make sense? And how do platform engineering teams build self-service internal developer platforms that abstract Kubernetes complexity for product teams?

## Notes in This Module

- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Serverless_and_Edge_Computing]] — Lambda/Cloud Functions architecture, cold start mitigation, edge compute (Cloudflare Workers, Deno Deploy), WebAssembly in production, cost crossover analysis (when serverless costs more than servers), and edge-origin hybrid architecture
- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__WebAssembly_and_WASI]] — WASM binary format, WASI 0.2 component model, server-side use cases (edge functions, plugin systems, database UDFs), runtime ecosystem (Wasmtime, WasmEdge), and comparison with containers
- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Kubernetes_and_Platform_Engineering]] — K8s architecture (control plane, data plane, operators, CRDs), orchestration patterns (sidecar, ambassador, adapter), service mesh, internal developer platforms (IDPs), and the "platform as product" philosophy

## Prerequisites
- [[Module_Module_12_MOC]] — Microservices (K8s orchestrates microservice deployments; serverless is an alternative to microservices)
- [[Module_Module_17_MOC]] — Deployment and observability (platform engineering standardizes these across an organization)

## Where This Leads
- [[Module_Module_19_MOC]] — AI inference on Kubernetes (GPU scheduling, model serving frameworks)
- This is the final module before capstones — these patterns provide the infrastructure context for all capstone designs
