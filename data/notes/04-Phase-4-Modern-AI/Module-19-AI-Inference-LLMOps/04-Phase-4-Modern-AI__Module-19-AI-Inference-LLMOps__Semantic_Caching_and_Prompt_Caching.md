# Semantic Caching and Prompt Caching

## Why This Exists

LLM inference is expensive. A GPT-4-class model call costs $0.01–$0.10 per request, takes 500ms–5s to respond, and consumes GPU time that could serve other users. Traditional caching (exact string match on the request) hits an LLM cache rarely — users rephrase questions constantly, so "What is the capital of France?" and "Tell me the capital of France" are different cache keys but should produce identical answers.

Two complementary caching strategies address this: **semantic caching** (cache based on the *meaning* of the query, not its exact text) and **prompt caching** (cache the *computation* of reused prompt prefixes within the LLM provider's infrastructure). Together, they can reduce LLM API costs by 40–80% for appropriate workloads while also improving latency for cache hits.

## Mental Model

**Semantic caching** is a librarian who understands your question's *intent*. You ask "How do I boil an egg?" — the librarian doesn't just look for that exact phrase. She looks for answers about egg boiling. When you come back an hour later and ask "What's the cooking time for a soft-boiled egg?", she recognizes you're asking the same type of question and gives you the same reference. The "lookup" is by meaning, not by words.

**Prompt caching** is a professor who highlights the textbook section you'll need before class starts. When every student asks questions, they start from the same highlighted page. The professor's "reading the textbook" work (the LLM prefill computation) is done once and reused across all students. You only pay for the work that's unique to each student's specific question.

## How It Works

### Semantic Caching Architecture

Semantic caching intercepts LLM queries before they reach the model:

1. **Embed the query**: Run the user's query through an embedding model (e.g., `text-embedding-3-small`) to get a dense vector representation of its meaning.
2. **Vector similarity search**: Search the cache (a vector store like Redis with vector search, Pinecone, or pgvector) for the nearest cached queries by cosine similarity.
3. **Threshold decision**: If the nearest match exceeds the similarity threshold (e.g., 0.92 cosine similarity), return the cached response. Below the threshold, proceed to the LLM.
4. **Store on miss**: After the LLM responds, store the (query embedding, response) pair in the vector cache with a TTL.

**The threshold is the hardest parameter**: Too high (0.99) → rarely hits, misses near-identical queries. Too low (0.80) → false positives, wrong answers returned for different questions. The right threshold depends on the domain and query distribution. For FAQ-style systems (limited question vocabulary), 0.90–0.95 works well. For open-ended queries, 0.95–0.98 is safer.

**Scope of applicability**: Semantic caching works well when:
- The query space has high repetition (FAQ bots, customer support, documentation search)
- Answers are not personalized (the same question has the same answer for all users)
- Answers are not time-sensitive (cached answers don't go stale quickly)

It works poorly when:
- Answers are personalized ("What's in my cart?", "Show my account balance")
- Answers are real-time ("What's the weather now?", "What's the stock price?")
- The query space is open-ended with low repetition (creative writing, unique analysis requests)

### Prompt Caching (Provider-Side KV Cache Reuse)

Modern LLM providers (Anthropic Claude, OpenAI) offer **prompt caching**: if a request's prompt prefix matches a recently-served prompt, the provider reuses the KV cache from the prefill computation rather than recomputing it.

**How LLM inference works internally**: The model processes the prompt in two phases:
- **Prefill**: Process all input tokens in parallel, compute the KV (key-value) attention cache. Expensive — scales with prompt length.
- **Decode**: Generate output tokens one at a time, using the KV cache from prefill. Cheaper per-step but must complete sequentially.

If you send the same system prompt + context to 1,000 users in parallel, without caching you pay the prefill cost 1,000 times. With prompt caching, you pay it once — the KV cache is stored on the provider's GPU and reused for subsequent requests that share the same prefix.

**Anthropic's implementation**: Mark cache breakpoints with `cache_control: {"type": "ephemeral"}`. The prefix up to that breakpoint is cached for 5 minutes. Cache hits are billed at ~10% of the normal input token cost. Cache misses pay full price. For a 10,000-token system prompt sent to 100 users: without caching, 10,000 × 100 = 1M tokens billed; with caching, 10,000 (first request) + 99 × few hundred tokens = ~10% of the cost.

**OpenAI's implementation**: Automatic prefix caching for prompts ≥ 1,024 tokens sharing the same prefix. No explicit API changes needed — caching happens transparently if the prefix matches a recent request.

### Cache Invalidation for LLM Responses

LLM cache entries become stale when:
- The underlying data changes (a RAG cache entry becomes invalid when the source document is updated)
- The model version changes (GPT-4o gives different answers than GPT-4-turbo)
- Business requirements change (a product description in the system prompt is updated)

**Strategies**:
- **TTL-based expiration**: Simple and predictable. Tune TTL to how frequently your context changes (24 hours for stable FAQ content; 1 hour for volatile product info; 0 for personalized content).
- **Tag-based invalidation**: Associate cache entries with source document IDs. When a document is updated, invalidate all cache entries tagged with that document's ID.
- **Model version namespacing**: Prefix cache keys with the model version (`gpt-4o:hash123`). Deploy a new model → different namespace → clean cache automatically.
- **Similarity score monitoring**: If you start seeing lower quality scores on cache hits (via LLM evaluation), lower your similarity threshold or reduce TTL.

## Trade-Off Analysis

| Approach | Cache Hit Rate | Risk of Wrong Answer | Implementation Cost | Latency on Hit |
|----------|---------------|---------------------|--------------------|----|
| **No caching** | 0% | None | None | N/A |
| **Exact match cache** | 1–5% (typical) | None | Low | < 5ms |
| **Semantic cache (strict threshold 0.95+)** | 15–40% | Low | Medium | 10–30ms (embedding + search) |
| **Semantic cache (loose threshold 0.85–0.90)** | 40–70% | Medium | Medium | 10–30ms |
| **Prompt caching (provider-side)** | 60–90%* | None | Very low | Provider-dependent |

*Prompt caching hit rate applies to the prompt prefix, not the full response.

## Failure Modes & Production Lessons

**1. Semantic cache returns wrong answer (false positive)**
User A asks "How do I cancel my order?" User B asks "How do I cancel my subscription?" Similarity score: 0.91 (above threshold). Semantic cache returns User A's "cancel order" response to User B's subscription question. Mitigation: domain-specific threshold tuning; add LLM-as-judge evaluation of cache hits in shadow mode before deploying; lower threshold for high-stakes domains (legal, medical, financial).

**2. Stale cache poisoning from outdated product info**
Your product description changes. The semantic cache returns old descriptions to users asking about the product. Mitigation: tie cache TTL to your content update frequency; implement tag-based invalidation triggered by your CMS update webhooks; for product/pricing info, skip the cache or use very short TTLs.

**3. Embedding model mismatch after upgrade**
You upgrade from `text-embedding-ada-002` to `text-embedding-3-large`. Existing cached embeddings are from the old model — their vector space is different. Cache lookups return incorrect similarity matches. Mitigation: namespace cache keys by embedding model version; rebuild the cache on embedding model upgrades.

**4. Prompt cache miss on slight prefix variation**
Your system prompt ends with the current date: `Today is March 27, 2026.` The prompt changes every day — the prefix never matches. You pay full prefill cost on every request. Mitigation: move dynamic content (date, request-specific context) to the end of the prompt, after the stable system prompt prefix. The cacheable prefix must be exactly identical across requests.

**5. Cache hit latency overhead exceeds LLM latency for fast models**
For a locally-hosted small model (< 100ms p99 latency), the embedding model call + vector search (30–50ms) to check the semantic cache is a significant fraction of the total latency — and often a cache miss anyway for unique queries. Mitigation: only use semantic caching for expensive or slow models (> 500ms latency); skip for fast local models where the cache overhead isn't justified.

## Architecture Diagram

```mermaid
flowchart TD
    User["User Query:\n'How do I reset my password?'"] --> Gateway["AI Gateway / Semantic Cache Layer"]

    Gateway --> Embed["Embedding Model\n(text-embedding-3-small)"]
    Embed --> |"dense vector [0.12, -0.34, ...]"| VecSearch["Vector Store\n(Redis / pgvector / Pinecone)"]

    VecSearch --> |"similarity ≥ 0.92?"| Decision{{"Cache Hit?"}}
    Decision --> |"YES (0.94 similarity)"| CachedResp["Return Cached Response\n(~10ms, ~$0.00)"]
    Decision --> |"NO (0.82 similarity)"| LLM["LLM API\n(GPT-4o / Claude)"]

    subgraph ProviderCache["Provider-Side Prompt Caching"]
        LLM --> |"System prompt (10k tokens)\ncache_control: ephemeral"| KVCache["KV Cache\n(stored on provider GPU)\n~5 min TTL"]
        KVCache --> |"Cache HIT: 90% cost reduction"| Decode["Decode (generate response)"]
        LLM --> |"Cache MISS: full prefill"| Decode
    end

    Decode --> Response["LLM Response"]
    Response --> |"store embedding + response"| VecSearch
    Response --> User
    CachedResp --> User

    style ProviderCache fill:var(--surface),stroke:var(--accent),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **Embedding cost**: `text-embedding-3-small` at $0.02 per 1M tokens. A 50-word query ≈ 75 tokens → $0.0000015 per query. Negligible vs. LLM cost.
- **Vector search latency**: ~1–10ms for Redis/pgvector with proper indexing; ~20–50ms for remote vector store (Pinecone). For real-time applications, use a local or in-region vector store.
- **Semantic cache storage**: 1,536-dimensional float32 vector + metadata ≈ ~6 KB per cached response. 100,000 cached entries ≈ 600 MB. Fits comfortably in Redis.
- **Prompt caching ROI**: A 20,000-token system prompt at $3/M input tokens = $0.06 per uncached call. At 1,000 calls/day: $60/day. With 80% cache hit rate: $12/day. **Savings: $48/day → $17,520/year** from prompt caching alone, for free (just add `cache_control`).
- **Semantic cache hit rate sweet spot**: FAQ/support chatbots: 30–60% hit rate typical. Internal documentation search: 20–40%. Customer service: 40–70% (users ask the same questions repeatedly).
- **Similarity search HNSW index**: For 1M cached entries, HNSW (Hierarchical Navigable Small World) search takes < 5ms with 95%+ recall. Rebuild time after bulk inserts: ~60 seconds per million vectors.

## Real-World Case Studies

- **Brex (Internal Finance Q&A)**: Brex built an internal finance assistant where employees ask accounting and compliance questions. ~65% of questions are near-duplicates across the 1,000-person company ("What's our expense policy for client meals?"). By deploying GPTCache (open-source semantic caching library) with a 0.90 similarity threshold, they reduced LLM API calls by 58%, saving $8,000/month and reducing average response latency from 2.3s to 0.3s for cache hits.

- **Anthropic (Claude Prompt Caching)**: Anthropic's prompt caching is explicitly designed for document Q&A, code analysis, and agentic workflows where a large context (code base, legal document, conversation history) is repeatedly reused. In their benchmarks, a 10,000-token document analysis workflow sees 85–90% cost reduction on subsequent questions after the first request primes the cache. The 5-minute TTL is designed to cover a typical user session.

- **Helicone (AI Observability + Caching)**: Helicone, an LLM observability platform, reports that customers using semantic caching reduce token costs by 20–40% on average. Their data shows that customer service bots (where users repeatedly ask similar billing/shipping/returns questions) have the highest cache hit rates (50–70%), while coding assistants have the lowest (5–15%) due to high query uniqueness.

## Connections

- [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__AI_Gateway_and_LLM_Operations]] — Semantic caching is typically implemented at the AI gateway layer
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Cache_Patterns_and_Strategies]] — Semantic caching extends traditional caching (TTL, invalidation, eviction) with vector similarity
- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__RAG_Architecture]] — RAG queries benefit from semantic caching of (query → retrieved chunks → answer) triples; invalidation driven by source document updates
- [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Inference_Serving_Architecture]] — KV cache management in the inference engine is separate from but complementary to semantic caching at the application layer
- [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]] — Semantic cache uses the same approximate nearest neighbor algorithms (HNSW, IVF) as vector search

## Reflection Prompts

1. You're building a customer support chatbot for an e-commerce platform. Users ask questions about order status ("Where is my order #12345?"), product details ("Does the blue jacket come in XL?"), and return policies ("What's your return policy?"). For which of these three question types should you use semantic caching, and for which should you skip it? What similarity thresholds would you set for each eligible type?

2. Your LLM API costs are $50,000/month. You analyze your query logs and find that 30% of queries share a high similarity (> 0.92 cosine) with previous queries. A semantic cache would cost $5,000/month to operate (vector store, embedding calls). Is this a good investment? What additional information would you need to make a confident decision?

3. A security researcher points out that your semantic cache could leak information: User A asks "What are the symptoms of HIV?" and caches a detailed response. User B later asks a similar question and receives the exact cached response intended for User A. Is this a privacy concern? Under what conditions? How would you mitigate it?

## Canonical Sources

- Anthropic documentation, "Prompt Caching" (docs.anthropic.com) — implementation guide and pricing
- OpenAI documentation, "Prompt Caching" (platform.openai.com/docs) — automatic prefix caching
- GPTCache documentation (github.com/zilliztech/GPTCache) — open-source semantic caching library
- Zilliz Blog, "Semantic Caching for LLMs" (2023) — architecture and similarity threshold analysis
- Helicone Engineering Blog, "LLM Caching in Production" — empirical cache hit rates across workloads
