# Phase 4: Modern Infrastructure & AI

*The frontier — AI serving, retrieval-augmented generation, agents, and platform abstraction.*

These topics aren't a separate silo. AI inference has the same trade-offs as any distributed system: batching (like database write batching), caching (KV cache is a specialized cache), load balancing (GPU scheduling), and cost engineering (GPUs at $2–30/hour). The vault teaches them that way — connecting back to foundational concepts.

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