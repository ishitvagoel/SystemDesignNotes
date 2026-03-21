# AI Gateway and LLM Operations

## Why This Exists

Most applications don't host their own LLMs — they call external providers (OpenAI, Anthropic, Google, or self-hosted endpoints). Without a gateway, each service team independently manages API keys, retry logic, rate limits, cost tracking, and failover. The same problems that led to [[API Gateway Patterns|API gateways]] for microservices apply to LLM integration, but with LLM-specific concerns: token-based cost, semantic caching, model quality evaluation, and prompt governance.

An AI gateway is the single control plane for all LLM interactions. It provides routing, caching, cost management, safety guardrails, and observability — the cross-cutting concerns that every LLM-consuming service needs but none should implement independently.

## Mental Model

Think of the AI gateway as a travel agent for LLM calls. Your application says "I need an answer to this question." The gateway decides: which airline (provider) is the best value for this trip? Is there a cached response from a similar trip? Is this traveler over their budget? Is this destination safe? The application doesn't need to know about airlines, pricing, or safety policies — the agent handles it.

## Core Capabilities

### Multi-Provider Routing

Route LLM requests across providers based on cost, latency, quality, or availability:

**Cost-based routing**: Route simple queries (classification, extraction, yes/no answers) to cheaper models (GPT-4o-mini at ~$0.15/M input tokens). Route complex queries (multi-step reasoning, code generation, analysis) to powerful models (Claude Opus, GPT-4o at ~$2.50–$10/M tokens). This single optimization typically saves 60–80% on LLM costs because most queries are simple.

**Latency-based routing**: For real-time applications (autocomplete, inline suggestions), route to the lowest-latency provider. For async tasks (batch summarization, report generation), route to the cheapest.

**Availability-based failover**: If the primary provider returns 5xx errors or exceeds latency thresholds, automatically route to a backup provider. The application never sees the outage. This is the same circuit breaker pattern from [[Resilience Patterns]], applied to LLM providers.

**Quality-based routing**: Some queries require specific model capabilities. Code generation routes to models with strong coding benchmarks. Multilingual queries route to models with strong language support. The gateway maintains a capability matrix and routes accordingly.

### The Classification Step

How does the gateway know which model tier a query needs? Three approaches, from simplest to most sophisticated:

**Heuristic rules**: Short queries (<50 tokens) → small model. Queries containing code blocks → coding model. Queries with "analyze" or "compare" → large model. Simple, fast, no additional cost.

**Lightweight classifier**: A small, fast model (or even a fine-tuned logistic regression on query embeddings) classifies query complexity. Adds ~5ms latency and negligible cost. More accurate than heuristics.

**Cascade**: Try the small model first. If its confidence is low (measured by output probability or a quality check), escalate to the large model. Adds latency for escalated queries but gives the small model the first shot at every query.

### Semantic Caching

Traditional caching caches exact key matches. "What's the capital of France?" and "Capital city of France?" are different strings → cache miss. Semantic caching uses embedding similarity to match semantically equivalent queries.

**Implementation**:
1. Embed the incoming query (fast — a small embedding model, ~1ms).
2. Search a vector index of cached query embeddings (pgvector, Redis with vector similarity, or a dedicated cache).
3. If the nearest neighbor's cosine similarity exceeds a threshold (e.g., 0.95), return the cached response.
4. Otherwise, call the LLM, cache the response with its query embedding.

**The threshold trade-off**:
- **0.98** (strict): Very few false positives (cached answer almost always matches the question). Low hit rate (~10–20%).
- **0.92** (permissive): Higher hit rate (~40–60%) but risk of returning answers to subtly different questions. "What's our vacation policy?" might match "What's our sick leave policy?"
- **Start at 0.95**, monitor quality via user feedback (thumbs down on wrong cached answers), and tune.

**What to cache and what not to**:
- **Cache**: Factual queries with stable answers (policy questions, product specs, common how-tos).
- **Don't cache**: Creative queries (different users want different creative outputs), personalized queries (the answer depends on user context), time-sensitive queries (news, stock prices), or queries where the prompt includes unique context (RAG queries with unique retrieved documents).

**Tenant-scoped caching**: In multi-tenant systems, each tenant's cache is isolated. Organization A's cached answers are invisible to Organization B, even for semantically identical questions — the answers might differ because the knowledge bases differ.

### Token Budgeting and Cost Control

LLM costs scale with tokens. Without controls, a runaway prompt (a user pastes a 100-page document) or a traffic spike can generate a devastating bill in hours.

**Controls**:
- **Per-request max_tokens**: Limit output length. Prevents a single request from consuming thousands of output tokens.
- **Per-user/per-tenant budgets**: Daily or monthly token caps. Free tier: 10K tokens/day. Pro tier: 1M tokens/day. Over budget → queue or reject requests with a clear message.
- **Prompt compression**: Strip redundant context, truncate overly long user inputs, summarize conversation history instead of passing the full transcript. Reducing input tokens by 30% reduces cost by ~30%.
- **Model tiering** (see routing above): The single most effective cost lever. Route 70% of queries to a model that costs 10× less.

**Cost attribution**: Track tokens consumed per user, per feature, per team, per tenant. This is the FinOps principle ([[Cost Engineering and FinOps]]) applied to AI — you can't optimize what you don't measure. The gateway logs token counts per request with metadata (user, tenant, model, feature) for aggregation.

### Governance and Safety

**Audit logging**: Log every prompt and response (or a configurable sample). Required for compliance in regulated industries (financial advice, healthcare). Redact PII before logging — use a PII detection model or regex-based scrubbing.

**Input guardrails**: Before sending to the LLM:
- PII detection: Scan prompts for names, emails, SSNs, credit card numbers. Mask or reject.
- Prompt injection detection: Detect attempts to override system prompts ("ignore all previous instructions").
- Topic filtering: Block queries outside the allowed domain (a customer support bot shouldn't answer questions about building weapons).

**Output guardrails**: Before returning to the user:
- Content filtering: Scan for harmful content, hallucinated claims, or policy violations.
- Factual grounding check: For RAG queries, verify that the answer is supported by the retrieved context (see [[RAG Architecture]] evaluation section).
- Format validation: If the output should be JSON, validate the structure before returning.

**Model version management**: LLM providers update models without notice. A model update can change output quality, tone, format, and refusal behavior. The gateway pins to specific model versions (e.g., `gpt-4o-2024-08-06`), tests new versions against an evaluation suite, and promotes only after quality verification.

## LLM Evaluation and Monitoring

### Quality Metrics

**Automated evaluation**: Run an evaluation suite (a set of test queries with expected answers or quality criteria) against the model regularly. Metrics:
- **Correctness**: Does the answer match the expected answer? (Exact match, semantic similarity, or judge-model evaluation)
- **Faithfulness** (for RAG): Is the answer grounded in the retrieved context? (Judge model checks each claim against context)
- **Refusal rate**: How often does the model refuse to answer? A spike in refusals indicates a model update or a prompt issue.
- **Format compliance**: For structured outputs (JSON, specific templates), what percentage parse correctly?

**User feedback**: Thumbs up/down on responses. Track per-model, per-query-type, per-tenant. A drop in thumbs-up rate correlates with quality regression.

### Drift Detection

If the provider updates their model (or you update your prompts), output characteristics may shift:
- **Response length**: Average output tokens per query. A sudden increase suggests the model is being more verbose (or hallucinating more).
- **Latency distribution**: Time-to-first-token and total generation time. Shifts indicate provider-side changes.
- **Semantic consistency**: For the same test queries, embed the responses and measure similarity to previous responses. High drift = the model is behaving differently.

### A/B Testing Model Versions

Route a percentage of traffic to a new model version. Compare quality metrics, latency, cost, and user feedback between the control (current model) and the treatment (new model). Promote if quality is equivalent or better; rollback if it regresses. This is the same [[Deployment and Release Engineering|canary release]] pattern applied to models.

## Trade-Off Analysis

| Pattern | Latency Overhead | Flexibility | Operational Cost | Best For |
|---------|-----------------|------------|-----------------|----------|
| Direct SDK calls (no gateway) | None | Low — vendor-locked | Low | Prototypes, single-model apps |
| API gateway with LLM routing | Low (one hop) | High — model switching, fallback | Medium | Multi-model apps, cost optimization |
| Dedicated LLM gateway (LiteLLM, Portkey) | Low (one hop) | Very high — unified API, observability | Medium | Production LLM apps with multiple providers |
| Self-hosted models (vLLM, TGI) | None (local) | Full control | High — GPU infrastructure | Data privacy, latency-sensitive, high-volume |

| Caching Strategy | Hit Rate | Freshness | Cost Savings | Best For |
|-----------------|---------|-----------|-------------|----------|
| Exact match cache | Low — queries must be identical | Perfect — same input = same output | Moderate | Repetitive queries, template-based prompts |
| Semantic cache (embedding similarity) | Higher — similar queries match | Approximate — similar ≠ identical | Higher | Customer support, FAQ-style queries |
| No caching | 0% | N/A | None | Creative generation, unique queries |

**Observability for LLMs is different from traditional services**: You need to track token usage (cost), latency per model, output quality (user feedback, hallucination rate), and prompt versions — not just HTTP status codes and response times. Tools like Langfuse, Helicone, and Braintrust are emerging to fill this gap. Without LLM-specific observability, you're flying blind on cost and quality.

## Failure Modes

- **Provider outage without failover**: The primary LLM provider goes down. All LLM-dependent features fail. Users see errors. Mitigation: multi-provider routing with automatic failover. Test failover regularly (chaos engineering for LLM dependencies).

- **Semantic cache poisoning**: A bad response gets cached. Every subsequent similar query returns the wrong answer. Mitigation: user feedback (thumbs down) triggers cache entry invalidation. Periodic quality audits on cached responses. TTL on cache entries (stale entries expire even without explicit invalidation).

- **Cost explosion from prompt injection**: An attacker crafts prompts that cause the model to generate extremely long outputs, consuming the tenant's entire token budget. Mitigation: per-request max_tokens, per-tenant budget enforcement, anomaly detection on token consumption.

- **Model version regression**: The provider silently updates the model. Quality drops. Users complain. The team doesn't know what changed because there's no baseline comparison. Mitigation: pin model versions, run evaluation suites on every version change, monitor drift metrics continuously.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Application Fleet"
        S1[Service A] -->|1. Standard API| GW[AI Gateway]
        S2[Service B] -->|1. Standard API| GW
    end

    subgraph "AI Gateway Control Plane"
        GW --> Cache{Semantic Cache}
        Cache -- "Hit" --> GW
        GW --> Classify{Query Classifier}
        Classify --> Router{Model Router}
    end

    subgraph "External Providers"
        Router -->|Simple| Mini[GPT-4o-mini / Claude Haiku]
        Router -->|Complex| Large[GPT-4o / Claude Opus]
        Router -->|Failover| Backup[Gemini Pro]
    end

    subgraph "Observability & Billing"
        GW --> TokenLog[Token Usage DB]
        GW --> Eval[Eval Engine: Grounding Check]
    end

    style GW fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Router fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Model Tiering Savings**: Routing 70% of traffic to "Mini" models instead of "Large" models typically reduces LLM costs by **60% - 80%**.
- **Semantic Cache Hit Rate**: Expect **20% - 40%** hit rate for common customer support or internal tool queries.
- **Latency Overhead**: A gateway adds **~10ms - 50ms** of overhead (mostly embedding for cache). This is negligible compared to the **~1s - 5s** LLM generation time.
- **Guardrail Latency**: PII detection and grounding checks can add **~100ms - 300ms**. Run these in parallel with the LLM call if possible (for output streaming).

## Real-World Case Studies

- **LinkedIn (Semantic Caching for Search)**: LinkedIn uses a sophisticated semantic cache for their AI-powered search features. They found that thousands of users ask the same "trending" questions every day. By caching these answers, they reduced their LLM bill by **30%** and improved response time for those queries from **3s to < 200ms**.
- **Klarna (Multi-Provider Resilience)**: During a major outage of a leading LLM provider in 2024, Klarna's AI assistant remained online. Their gateway detected the 5xx errors and automatically routed all traffic to a backup provider within seconds. Most users never even noticed the switch, proving the value of **Provider-Agnostic Gateways**.
- **Notion (Per-Tenant Quotas)**: Notion AI uses their gateway to enforce strict token budgets per workspace. By attributing every token to a specific `workspace_id`, they ensure that a single viral document or a buggy integration in one company doesn't consume their entire global API quota, protecting their margins and system stability.

## Connections

- [[Inference Serving Architecture]] — The serving layer that the gateway routes to (for self-hosted models)
- [[API Gateway Patterns]] — AI gateways are specialized API gateways with LLM-specific features
- [[Cache Patterns and Strategies]] — Semantic caching extends traditional caching with embedding-based similarity
- [[Rate Limiting and Throttling]] — Token-based rate limiting for LLM APIs
- [[Cost Engineering and FinOps]] — LLM cost management is a FinOps concern
- [[Observability and Alerting]] — LLM-specific monitoring (token usage, quality metrics, drift detection)

## Reflection Prompts

1. Your company spends $80,000/month on OpenAI API calls across 12 services. Nobody knows which service or feature consumes the most tokens. Design the AI gateway's cost attribution system. What metadata do you log per request? How do you surface the data to engineering teams? What's the likely top optimization opportunity once you have visibility?

2. You implement semantic caching with a 0.93 similarity threshold. A user asks "What's our return policy for electronics?" and gets a cached response for "What's our return policy for clothing?" (the policies differ). The user reports the wrong answer. How do you detect and prevent this class of error systematically?

## Canonical Sources

- *Generative AI System Design Interview* by Alex Xu (2024) — AI gateway and LLM serving architecture
- Portkey documentation (portkey.ai) — open-source AI gateway with routing, caching, and observability
- LiteLLM documentation — unified LLM API across providers with cost tracking
- Anthropic documentation, "Prompt caching" — provider-side caching that complements gateway-level semantic caching