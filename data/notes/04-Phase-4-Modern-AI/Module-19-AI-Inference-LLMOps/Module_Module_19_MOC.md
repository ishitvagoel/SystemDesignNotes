# Module 19: AI/ML Inference Serving & LLM Operations

*Serving AI models in production — where distributed systems meets machine learning.*

## Why This Module Matters

Training an AI model is a batch job. Serving it in production is a distributed systems problem. LLM inference introduces challenges that traditional web services never faced: GPU memory management (KV caches consume gigabytes per concurrent request), variable-length outputs that make latency unpredictable, and cost structures where a single inference call can cost 100x more than a database query.

This module covers the inference serving stack — from low-level GPU optimizations (continuous batching, PagedAttention, quantization) to high-level operational patterns (AI gateways, semantic caching, model routing, LLM evaluation). If you're building any system that serves AI models, these are the distributed systems patterns you need.

## Notes in This Module

- [[Inference Serving Architecture]] — Continuous batching, model parallelism, quantization (INT8/INT4), KV cache management with PagedAttention, disaggregated prefill/decode, and the vLLM/TensorRT-LLM landscape
- [[AI Gateway and LLM Operations]] — Gateway patterns (routing, fallback, rate limiting), semantic caching, prompt management, cost tracking, LLM evaluation frameworks, and guardrail architectures
- [[Semantic Caching and Prompt Caching]] — Deep dive on vector similarity-based query caching, provider-side KV cache reuse, similarity threshold tuning, cache invalidation, and cost/latency analysis

## Prerequisites
- [[_Module 06 MOC]] — Caching (semantic caching for LLMs is an evolution of traditional cache patterns)
- [[_Module 02 MOC]] — API design (AI gateways are API gateways specialized for inference)
- [[_Module 16 MOC]] — Reliability (inference serving has unique failure modes that require resilience patterns)

## Where This Leads
- [[_Module 20 MOC]] — RAG and agentic systems build on inference infrastructure
- [[_Module 14 MOC]] — Vector search (embedding generation for search runs on inference serving infrastructure)
