# Module 20: RAG, Agentic Systems & Real-Time Collaboration

*Grounding AI in knowledge, giving it tools, and building systems where humans collaborate in real time.*

## Why This Module Matters

This module covers three of the most active frontiers in systems design. RAG (Retrieval-Augmented Generation) is now the standard pattern for grounding LLMs in domain knowledge — every enterprise AI deployment uses some form of it. Agentic systems extend LLMs from answerers to actors — systems that can reason, plan, use tools, and iterate. And real-time collaboration (the engineering behind Google Docs, Figma, and multiplayer apps) is a masterclass in distributed state synchronization.

These topics share a common thread: they all require carefully orchestrated distributed systems to deliver responsive, correct, multi-user experiences.

## Notes in This Module

- [[RAG Architecture]] — The full pipeline: chunking strategies, embedding models, vector retrieval, hybrid search, re-ranking, context window management, and enterprise patterns (multi-index, query routing, evaluation)
- [[Agentic System Architecture]] — ReAct loops, multi-agent patterns (hierarchical, horizontal), tool use, memory (short and long-term), guardrails, and observability for multi-step reasoning chains
- [[Real-Time Collaboration]] — WebSocket scaling, CRDTs vs Operational Transform, presence systems, CDC-to-frontend pipelines, and the architecture behind collaborative editors

## Prerequisites
- [[_Module 14 MOC]] — Search systems (vector search is the retrieval layer in RAG)
- [[_Module 19 MOC]] — Inference serving (RAG and agents both depend on LLM inference)
- [[_Module 11 MOC]] — CRDTs (the core data structure for conflict-free real-time collaboration)

## Where This Leads
- Capstone: AI Search and Chat Platform — Puts RAG and agentic patterns into a full system design
- Capstone: Collaborative Editor — Applies real-time collaboration patterns end-to-end
