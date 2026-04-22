# Module 20: RAG, Agentic Systems & Real-Time Collaboration

*Grounding AI in knowledge, giving it tools, and building systems where humans collaborate in real time.*

## Why This Module Matters

This module covers three of the most active frontiers in systems design. RAG (Retrieval-Augmented Generation) is now the standard pattern for grounding LLMs in domain knowledge — every enterprise AI deployment uses some form of it. Agentic systems extend LLMs from answerers to actors — systems that can reason, plan, use tools, and iterate. And real-time collaboration (the engineering behind Google Docs, Figma, and multiplayer apps) is a masterclass in distributed state synchronization.

These topics share a common thread: they all require carefully orchestrated distributed systems to deliver responsive, correct, multi-user experiences.

## Notes in This Module

- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__RAG_Architecture]] — The full pipeline: chunking strategies, embedding models, vector retrieval, hybrid search, re-ranking, context window management, and enterprise patterns (multi-index, query routing, evaluation)
- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__Agentic_System_Architecture]] — ReAct loops, multi-agent patterns (hierarchical, horizontal), tool use, memory (short and long-term), guardrails, and observability for multi-step reasoning chains
- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__Agent_Reliability_Patterns]] — Tool-call error taxonomy (retryable vs non-retryable vs LLM-specific), idempotency keys, checkpoint-and-resume, circuit breakers for LLM APIs, and the graceful degradation ladder
- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__Real-Time_Collaboration]] — WebSocket scaling, CRDTs vs Operational Transform, presence systems, CDC-to-frontend pipelines, and the architecture behind collaborative editors

## Prerequisites
- [[Module_Module_14_MOC]] — Search systems (vector search is the retrieval layer in RAG)
- [[Module_Module_19_MOC]] — Inference serving (RAG and agents both depend on LLM inference)
- [[Module_Module_11_MOC]] — CRDTs (the core data structure for conflict-free real-time collaboration)

## Where This Leads
- Capstone: AI Search and Chat Platform — Puts RAG and agentic patterns into a full system design
- Capstone: Collaborative Editor — Applies real-time collaboration patterns end-to-end
