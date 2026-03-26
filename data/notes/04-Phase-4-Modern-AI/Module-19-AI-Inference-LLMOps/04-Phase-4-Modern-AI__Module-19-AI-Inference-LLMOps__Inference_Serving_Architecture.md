# Inference Serving Architecture

## Why This Exists

Serving ML models in production — especially large language models — is a distributed systems problem with GPU-shaped constraints. The same trade-offs apply: batching (like database write batching), caching (KV cache is a specialized cache), load balancing (GPU scheduling across a fleet), and cost management (GPUs are $2–30/hour). But the specific mechanics — token-by-token generation, KV cache memory management, and the prefill/decode split — are unique to inference serving.


## Mental Model

A sushi conveyor belt restaurant. Training a model is writing the menu and perfecting the recipes (done once, offline). Inference serving is running the restaurant at lunchtime. Each customer (request) sits down and picks sushi plates from the belt (generated tokens). The kitchen (GPU) must balance: preparing new plates fast enough for all customers (throughput), not making any customer wait too long for their order (latency), and not running out of counter space to hold plates in progress (KV cache memory). Continuous batching is like dynamically adding and removing seats at the belt — new customers don't wait for everyone to finish; they join the belt as soon as a seat opens. PagedAttention is like using stackable plates instead of fixed trays — no wasted counter space between orders.

## Why Inference Is Different from Training

| Dimension | Training | Inference |
|-----------|---------|-----------|
| Optimization target | Throughput (samples/second) | Latency (time to first token, time per token) |
| Batch size | Large (thousands) | Small (1–128 concurrent requests) |
| Duration | Hours to weeks | Milliseconds to minutes per request |
| Cost model | Fixed (GPU-hours for a training run) | Variable (cost per token, per request) |
| Failure impact | Restart from checkpoint | User-visible latency/error |

## Batching Strategies

### Why Static Batching Failed for LLMs (The 2023 Context)

Before understanding continuous batching, it helps to understand why the standard approach collapsed specifically in 2023. For traditional inference workloads — CNNs for image classification, BERT for text classification — the output is always a fixed-size tensor. You can batch 64 requests, run one forward pass, and return all 64 results simultaneously. Static batching is trivially optimal here: all batch members finish at the same time.

LLMs broke this assumption. They generate tokens autoregressively, one at a time, and the output length is not known at request start. Request A might produce 50 tokens (a short answer). Request B might produce 2,000 tokens (detailed code generation). With static batching, A finishes in 50 decode steps but must wait for B to finish 2,000 steps before its slot in the batch is released. For those 1,950 steps, A's GPU allocation is entirely wasted — it has finished its work but is holding the batch open. GPU utilization under static batching dropped to 20–40% in real deployments with mixed-length outputs.

The crisis became acute in 2023 when open-source LLMs (LLaMA in February 2023, followed by dozens of fine-tunes) gave organizations their first experience deploying large generative models on their own hardware. The output length distribution was highly bimodal: chatbot-style queries averaged ~100 tokens, while code generation and document summarization averaged 1,000–3,000 tokens. A single long-output request could hold a GPU batch hostage for seconds while dozens of short requests queued behind it. The Orca paper (Yu et al., 2022) had described the solution — schedule at the *iteration* level, releasing completed requests after each single token generation step so new requests immediately fill the slot — but it was vLLM's open-source release in May 2023 that made continuous batching accessible. The result was approximately a doubling of effective throughput for the same hardware.

**Static batching**: Wait for N requests, process them together. Simple but introduces latency (waiting for the batch to fill) and wastes GPU if the batch isn't full.

**Dynamic batching**: Set a maximum wait time (e.g., 5ms). Batch whatever requests have arrived within that window. Balances latency and throughput.

**Continuous batching** (used by vLLM, TensorRT-LLM): For autoregressive generation (LLMs), different requests finish at different times. Continuous batching doesn't wait for all requests in a batch to finish — as one request completes, a new request is immediately inserted into the batch. The GPU is never idle waiting for the slowest request.

**Iteration-level scheduling**: Each token generation step is a scheduling opportunity. Between iterations, the scheduler can add new requests, evict requests whose KV cache is too large, or prioritize requests nearing their deadline.

## Model Optimization

**Quantization**: Reduce weight precision from FP16 (16-bit) to INT8 (8-bit), INT4, or FP8. Reduces memory footprint by 2–4×, increases throughput, with modest quality loss (0.5–2% on benchmarks). GPTQ, AWQ, and bitsandbytes are popular quantization methods.

**Speculative decoding**: Use a small, fast "draft" model to generate candidate tokens, then verify them with the large model in a single forward pass. If the draft is correct (often 70–90% of tokens), you skip individual decoding steps. Effectively increases throughput 2–3× for compatible model pairs.

**Distillation**: Train a smaller model to mimic a larger model's outputs. The smaller model is cheaper to serve but approaches the larger model's quality on specific tasks.

## KV Cache Management

During autoregressive generation, each transformer layer caches key-value pairs for all previous tokens. This **KV cache** grows linearly with sequence length and consumes GPU memory (HBM). For a 70B parameter model with 4K context, the KV cache per request is ~1–2GB.

**PagedAttention** (vLLM): Instead of pre-allocating contiguous memory for each request's KV cache, PagedAttention manages KV cache like virtual memory — in non-contiguous pages. This eliminates memory fragmentation and increases the number of concurrent requests a GPU can handle by 2–4×.

**Prefix caching**: If multiple requests share the same system prompt (common in production), cache the KV state for the shared prefix. New requests skip the prefill computation for the shared portion. vLLM and TensorRT-LLM support this.

**KV cache offloading**: SRAM → HBM → DDR → remote storage hierarchy. For very long contexts, spill KV cache from GPU memory to CPU memory or even NVMe, loading pages back as needed. Adds latency but enables longer contexts than GPU memory alone allows.

## Disaggregated Prefill/Decode

LLM inference has two phases: **prefill** (process the entire input prompt in parallel — compute-heavy) and **decode** (generate tokens one at a time — memory-bandwidth-heavy). These have different hardware requirements:

- Prefill benefits from high compute (GPU FLOPs)
- Decode benefits from high memory bandwidth (fast KV cache access)

**Disaggregated architecture**: Separate prefill and decode into different GPU pools. Prefill nodes process prompts and transfer the KV cache to decode nodes, which generate the response. Each pool can be independently scaled and optimized.

## Serving Framework Landscape (2025–2026)

The LLM serving ecosystem has consolidated around a few production-grade frameworks:

**vLLM**: The most widely adopted open-source serving engine. PagedAttention is the default KV cache strategy. Supports continuous batching, tensor/pipeline parallelism, quantization (FP4/FP8/INT4/AWQ/GPTQ), multi-LoRA serving, and speculative decoding (EAGLE-3, draft models, ngram). The standard choice for most production deployments.

**SGLang**: Emerged as a high-performance alternative, now deployed on 400K+ GPUs. Key innovations include RadixAttention (efficient prefix caching via a radix tree), a zero-overhead CPU scheduler, and native prefill-decode disaggregation. Provides day-one support for new models (DeepSeek V3/R1, Llama 4). Marginally better performance than vLLM at moderate concurrency for many workloads.

**TensorRT-LLM**: NVIDIA's optimized engine for their hardware (H100/H200/B200). Best performance on NVIDIA GPUs when fully optimized, but less flexible and harder to configure than vLLM/SGLang.

**Speculative decoding matured**: EAGLE-3 (2025) is the current state-of-the-art — it achieves up to 4.8x speedup by using a draft model that operates at a hybrid feature level with dynamic tree-based generation. Production frameworks now ship with native EAGLE support. The SpecForge training framework and Red Hat's Speculators library standardize draft model training and deployment.

## GPU Scheduling

**Multi-tenancy on GPUs**: Multiple models or users share GPUs. Options:

| Approach | Isolation | Utilization | Complexity |
|----------|-----------|------------|------------|
| Time-slicing | Low (context switching) | High | Low |
| MPS (Multi-Process Service) | Medium | High | Medium |
| MIG (Multi-Instance GPU, A100/H100) | High (hardware partitioned) | Medium | Medium |

**Multi-LoRA serving**: Serve multiple fine-tuned adapters on a shared base model. The base model weights are loaded once; LoRA adapter weights (~0.1% of base model size) are swapped per request. Enables personalized models per tenant without dedicating a full GPU per model.

## Hardware Landscape

| Hardware | Provider | Strengths | Use Case |
|----------|----------|-----------|----------|
| NVIDIA B200/H100 | NVIDIA | Highest performance, CUDA ecosystem, universal support | Training + inference, default choice |
| Google TPU v5e/v6 | Google | Cost-efficient for Tensor operations, XLA compiler | Google Cloud workloads, JAX models |
| AWS Inferentia2/Trainium | AWS | Cost-optimized for inference/training on AWS | AWS-native workloads |
| Meta MTIA | Meta | Custom chip for ranking/recommendation | Meta internal |

## Architecture Diagram

```mermaid
graph TD
    subgraph "Inference Gateway"
        Request[User Prompt] --> LB[Inference Load Balancer]
    end

    subgraph "GPU Worker Cluster (vLLM/SGLang)"
        LB --> Worker1[GPU Node 1]
        LB --> Worker2[GPU Node 2]
        
        subgraph "Worker Internals"
            Worker1 --> Scheduler[Continuous Batching Scheduler]
            Scheduler --> PagedAttn[PagedAttention: KV Cache]
            PagedAttn --> GPU[(NVIDIA H100 / TPU)]
        end
    end

    subgraph "Model & KV Storage"
        Worker1 & Worker2 --> ModelStore[(Model Registry: S3)]
        Worker1 & Worker2 -.-> PrefixCache{Shared Prefix Cache}
    end

    style GPU fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style PagedAttn fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Memory Formula**: A model requires `2 * Number of Parameters` GB of VRAM in FP16 (e.g., Llama-70B needs **140GB**). Quantization (INT4) reduces this by **4x**.
- **KV Cache Size**: For a typical 70B model, the KV cache consumes **~1MB per token per request**. 100 concurrent users with 1000 tokens each = **~100GB of extra VRAM** needed.
- **Throughput vs Latency**: Increasing batch size from 1 to 32 typically increases throughput by **4x - 8x** but can double the **Time Per Output Token (TPOT)**.
- **Speculative Decoding**: Using a small draft model (e.g., 1B draft for a 70B target) can reduce latency by **2x - 3x** for standard prose.

## Real-World Case Studies

- **OpenAI (Disaggregated Inference)**: OpenAI famously moved to a disaggregated architecture where "Prefill" (processing the prompt) and "Decode" (generating tokens) happen on different GPU pools. This allows them to optimize the high-compute prefill phase differently than the memory-bandwidth-bound decode phase, maximizing the efficiency of their massive H100 clusters.
- **DoorDash (Multi-LoRA Serving)**: DoorDash uses LLMs for various tasks like menu parsing and customer support. Instead of deploying dozens of full models, they use a single base model (Llama-3) and swap tiny **LoRA Adapters** (~100MB each) on the fly. This allows them to serve personalized models for different tasks on the same GPU fleet, reducing costs by **80%**.
- **DeepSeek (Multi-Head Latent Attention)**: DeepSeek-V3 introduced a novel architecture that dramatically reduces the KV cache size compared to standard Transformers. By compressing the KV state into a latent vector, they can handle **much higher batch sizes** on the same hardware, which is a major factor in their industry-leading price-to-performance ratio.

## Connections

- [[AI Gateway and LLM Operations]] — The routing, caching, and governance layer above inference serving
- [[Load Balancing Fundamentals]] — GPU load balancing shares principles but has unique constraints (model loading, KV cache locality)
- [[Cache Patterns and Strategies]] — KV cache is a specialized cache; prefix caching parallels CDN origin shield
- [[Cost Engineering and FinOps]] — GPU cost dominates AI infrastructure spend

## Cost Per Token Benchmarks (2025–2026)

Inference cost varies dramatically across providers, model sizes, and optimization choices:

| Provider / Model | Input Cost (per 1M tokens) | Output Cost (per 1M tokens) | Notes |
|-----------------|---------------------------|----------------------------|-------|
| OpenAI GPT-4o | $2.50 | $10.00 | Optimized multi-modal model |
| OpenAI GPT-4o-mini | $0.15 | $0.60 | Best cost/quality for simple tasks |
| Anthropic Claude Sonnet | $3.00 | $15.00 | Strong reasoning, long context |
| Anthropic Claude Haiku | $0.25 | $1.25 | Fast, cost-effective for classification |
| Google Gemini 2.0 Flash | $0.10 | $0.40 | Aggressive pricing, multi-modal |
| Self-hosted Llama 3 70B (H100) | ~$0.50–1.00* | ~$1.00–2.00* | *Amortized GPU cost; varies with utilization |
| Self-hosted Llama 3 8B (A10G) | ~$0.05–0.10* | ~$0.10–0.20* | *Best unit economics for simple tasks |

**Key insight**: The cost difference between the most and least expensive options is **50–100×**. For high-volume applications (>1M requests/day), model and provider selection dominates total cost — not infrastructure optimization.

**Reasoning models (o1, o3, R1)**: These models generate internal "thinking" tokens that are not visible but are billed. A simple question may consume 500–5,000 thinking tokens before producing a 100-token answer. This makes reasoning models **5–50× more expensive per request** than standard models and breaks traditional batching assumptions (output length is unpredictable). Budget for 10× the output tokens of standard models when estimating reasoning model costs.

## Canonical Sources

- Kwon et al., "Efficient Memory Management for Large Language Model Serving with PagedAttention" (2023) — the vLLM paper
- *Generative AI System Design Interview* by Alex Xu (2024) — inference serving architecture chapters
- *Designing Distributed Systems* by Brendan Burns (2nd ed, 2024) — AI inference patterns in container environments
- Leviathan, Kalman, Matias, "Fast Inference from Transformers via Speculative Decoding" (2023)

## Trade-Off Analysis

| Optimization | Benefit | Cost | When to Use |
|-------------|---------|------|-------------|
| Continuous batching | 2-5x throughput | Higher p99 latency per request | High-throughput serving |
| INT8 quantization | 2x memory reduction, 1.5x speed | ~1% quality loss on most tasks | Production deployments |
| INT4 quantization | 4x memory reduction | Noticeable quality loss on reasoning | Edge/mobile or cost-constrained |
| PagedAttention | Near-zero KV cache waste | Implementation complexity | Always (it's the default in vLLM) |
| Speculative decoding | 2-3x decode speed | Requires draft model, wasted compute on rejections | Latency-sensitive applications |
| Disaggregated prefill/decode | Independent scaling of phases | Network overhead between pools | Large-scale multi-model serving |
| Tensor parallelism | Serve models larger than one GPU | Inter-GPU communication overhead | Models > single GPU memory |
| Pipeline parallelism | Higher throughput | Higher latency, bubble overhead | Very large models (100B+) |

**The fundamental trade-off**: Throughput vs latency. Batching more requests together increases throughput (GPU utilization) but increases latency for individual requests. SLOs determine where you set this dial.

## Failure Modes

**GPU out-of-memory (OOM)**: The most common failure. Long sequences consume more KV cache than expected. Solution: set max sequence length limits, use PagedAttention to avoid fragmentation, and implement graceful request rejection when memory is low.

**Cascading timeout from slow prefill**: A single very long prompt in a batch delays all other requests in that batch during prefill. Solution: separate prefill and decode pools (disaggregation), or set strict prompt length limits.

**Model loading failures**: Loading a 70B model takes minutes and can fail due to disk I/O, memory fragmentation, or corrupted weights. Solution: pre-load models, use model caching, health checks that verify model readiness.

**Quantization quality cliffs**: A model that works fine at INT8 may produce garbage at INT4 for specific tasks (math, code, structured output). Solution: evaluate quantized models on your specific task distribution before deploying, not just on benchmarks.

**GPU thermal throttling**: Sustained 100% GPU utilization can trigger thermal throttling, reducing throughput unpredictably. Solution: monitor GPU temperature, ensure adequate cooling, and leave some GPU headroom.

**Request queue starvation**: Under high load, new requests queue behind a backlog. If the queue grows faster than it drains, latency climbs without bound. Solution: implement load shedding — reject requests when queue depth exceeds a threshold, returning a 503 rather than timing out.

## Reflection Prompts

1. You're serving a 70B parameter model. You need p99 latency under 2 seconds for 200-token completions. Walk through your hardware selection (how many GPUs, what type), parallelism strategy, and batching configuration. How do you handle a traffic spike of 3x?
2. Why does PagedAttention matter? Calculate the KV cache memory for a single request with a 4K context window on a model with 32 layers and 32 heads with 128-dim head size in FP16. Now multiply by 100 concurrent requests. What happens without paging?
3. Your inference service is running at 90% GPU utilization. Product wants to add a new feature that doubles average prompt length. What breaks? What are your options?
