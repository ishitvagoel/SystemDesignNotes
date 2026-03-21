# Phase 4: Modern Infrastructure & AI

*The frontier — AI serving, retrieval-augmented generation, agents, and platform abstraction.*

These topics aren't a separate silo. AI inference has the same trade-offs as any distributed system: batching (like database write batching), caching (KV cache is a specialized cache), load balancing (GPU scheduling), and cost engineering (GPUs at $2–30/hour). The vault teaches them that way — connecting back to foundational concepts.

## Modern Stack Architecture

```mermaid
graph LR
    subgraph "Phase 4: The 2025+ Edge"
        M21[M21: Platform / Edge] --> M19[M19: AI Inference]
        M19 --> M20[M20: RAG & Agents]
    end

    style M19 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style M20 fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Senior Engineer's AI/Cloud Heuristic

- **GPU is the new CPU**: AI inference has different scaling laws (KV Cache, VRAM limits). Design your platform around high-bandwidth memory, not just core count.
- **Compute moves to the Edge**: Use Wasm and V8 isolates to move logic to the user. Centralized data, decentralized compute.
- **Agents are Distributed Systems**: An agentic workflow is just a self-healing distributed process. Use the same patterns (Retries, Timeouts, Idempotency) you use for microservices.

## Modules

| Module | Focus | Key Question Answered |
|--------|-------|----------------------|
| [[_Module 19 MOC]] | AI/ML Inference & LLMOps | How do you serve models in production? |
| [[_Module 20 MOC]] | RAG, Agents & Real-Time | How do you build retrieval, agentic, and collaborative systems? |
| [[_Module 21 MOC]] | Serverless, Edge & Platform | How do you abstract infrastructure for developers? |

## The Connecting Thread

Every AI system design problem maps to a classical distributed systems problem:
- KV cache management → buffer pool management (M3)
- Semantic caching → cache-aside with embedding keys (M6)
- Multi-provider LLM routing → load balancing with quality-awareness (M1)
- Agent tool orchestration → saga pattern with compensating actions (M10)
- RAG pipeline → read-through cache backed by search infrastructure (M14)