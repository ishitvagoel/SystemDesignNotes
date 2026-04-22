# Agent Reliability Patterns

## Why This Exists

An LLM agent is a distributed system. Each tool call is a service boundary with all the failure modes of a regular RPC: timeouts, rate limits, transient errors, idempotency violations. Unlike a traditional RPC client, agents have an additional failure mode unique to LLMs: the model itself can hallucinate a nonexistent tool name, generate syntactically invalid JSON for tool arguments, or call the right tool with semantically wrong parameters.

Most agent frameworks handle the happy path well. They fail silently on the unhappy path: a tool call that gets a 429 rate limit causes the agent to stall indefinitely, a non-idempotent tool called twice causes duplicate side effects, and a hallucinated tool name causes a cryptic error with no recovery path. Production agents need the same reliability patterns as production microservices — with LLM-specific additions for the model's unique failure modes.

## Mental Model

Think of an agent as a **pipeline of service calls where the orchestrator is probabilistic**. In a regular microservice, the orchestration logic is deterministic code. In an agent, the orchestration logic is a model inference — the model decides which tool to call, with what arguments, and when to stop. This probabilistic orchestrator can be wrong in ways deterministic code cannot.

The reliability pattern therefore has two layers:
1. **Infrastructure reliability**: Handle tool-call failures the same way any distributed system does — with retries, backoff, circuit breakers, and timeouts.
2. **Model reliability**: Handle LLM-specific failures — hallucinated tool names, malformed arguments, goal drift — with validation, correction prompts, and graceful degradation.

Both layers are needed. Infrastructure reliability without model reliability leaves you with a system that retries hallucinated tool calls indefinitely. Model reliability without infrastructure reliability leaves you with a correct orchestration plan that fails on transient errors.

## Tool-Call Error Taxonomy

Before designing retry logic, classify errors by recoverability:

### Retryable Errors (Transient)
These resolve without changing the request:
- **429 Too Many Requests**: Rate limit hit. Back off and retry.
- **503 Service Unavailable**: Downstream tool temporarily unavailable. Retry with exponential backoff.
- **504 Gateway Timeout**: Network path issue. Retry after brief delay.
- **Network timeout**: Connection dropped mid-call. Retry if idempotent; use idempotency key if not.

### Non-Retryable Errors (Permanent)
These will fail regardless of how many times retried:
- **400 Bad Request**: Invalid arguments. The model generated malformed input — retry with the same args will fail identically. Requires argument correction.
- **401 Unauthorized / 403 Forbidden**: Credentials wrong or permission denied. The agent cannot fix this without operator intervention.
- **404 Not Found**: Resource doesn't exist. Retrying will not create it.
- **422 Unprocessable Entity**: Semantically invalid (syntactically valid JSON but wrong value types/ranges). Requires argument correction.

### LLM-Specific Errors
These don't map to HTTP status codes:
- **Hallucinated tool name**: Model calls `search_email` but only `search_documents` exists. Error: `ToolNotFoundError`. Recovery: inject available tool list into correction prompt.
- **Malformed arguments**: Model generates `{"date": "yesterday"}` where the schema requires ISO 8601 format. Recovery: validate against JSON schema before calling; return schema violation as a tool result for the model to self-correct.
- **Missing required argument**: Model calls a tool with optional fields but omits required ones. Recovery: schema validation before execution.
- **Goal drift**: Model successfully calls tools but drifts from the original task (common in long chains). Recovery: periodic goal-check against original task description; max step count with graceful termination.

## Retry and Backoff Strategy

```
retry_budget = min(max_wall_clock_budget, max_attempts × avg_tool_latency)
```

**Exponential backoff with jitter** for retryable errors:
- Attempt 1: immediate
- Attempt 2: 1s + random(0, 1s)
- Attempt 3: 2s + random(0, 2s)
- Attempt 4: 4s + random(0, 4s)
- Max attempts: 3–5 for most tools; 1 for non-idempotent writes without idempotency keys

**Budget-based retry limit**: Don't count only attempts — enforce a wall-clock budget. A tool chain with 5 steps, each allowing 3 retries at 4s backoff = 60s maximum. Set the agent's total wall-clock budget (e.g., 120s) and abort when exceeded, regardless of retry count.

**Zero retry for unsafe writes**: If a tool mutates state and has no idempotency key, never retry on ambiguous errors (network timeout where the call may have succeeded). Instead: fail explicitly and surface the ambiguity to the user or a recovery flow.

## Idempotent Tool Design

The hardest reliability problem: **at-least-once tool execution for state-mutating tools**.

The agent framework retries a tool call that timed out. Was the first call received and executed? Unknown. If the tool is not idempotent, retrying creates duplicate state: two payments charged, two emails sent, two database rows inserted.

**Pattern: Idempotency Keys**

Every state-mutating tool should accept an idempotency key. The agent framework generates a stable key per tool call (e.g., `sha256(agent_id + step_index + tool_name + args_hash)`). If the tool receives the same key twice, it returns the cached result without re-executing.

```
Tool interface:
{
  "tool": "send_email",
  "idempotency_key": "agent-abc123-step-3-send_email-a1b2c3",
  "args": { "to": "...", "subject": "..." }
}
```

Implementation: The tool service maintains an idempotency key store (Redis, with 24h TTL). On receipt: check key → if found, return cached response; if not found, execute, store response, return.

**Pattern: Checkpoint-and-Resume**

For long agent chains (10+ steps), checkpoint agent state after each successful tool call to durable storage. If the agent process crashes mid-chain, resume from the last checkpoint rather than restarting from scratch. This prevents both duplicate side effects (idempotency keys cover already-completed steps) and lost progress (checkpoints cover agent state).

State to checkpoint: step index, all tool call results so far, original task, agent memory. Storage: Redis (fast, volatile) for in-flight checkpoints; database (durable) for chains that need resumption after process restart.

## Graceful Degradation Ladder

When a tool fails and recovery attempts are exhausted, the agent should degrade gracefully rather than returning a generic error. The degradation ladder (attempt each level before escalating):

| Level | Action | When to Use |
|-------|--------|-------------|
| 1 | **Retry with backoff** | Retryable errors (429, 503, timeout) |
| 2 | **Use cached result** | Tool retrieves data that was recently fetched in this session |
| 3 | **Skip optional tool** | Tool result is enrichment, not required for task completion |
| 4 | **Use simpler tool** | Downgrade: vector search → keyword search; GPT-4o → GPT-4o-mini |
| 5 | **Return partial answer** | Complete task with available data; explicitly note missing information |
| 6 | **Fail explicitly** | Non-retryable error; return structured failure with reason, what was attempted, and recovery options |

The agent should never return a silent failure. Level 6 ("fail explicitly") is always better than returning a partial answer without flagging it as incomplete.

## Circuit Breaker for LLM APIs

When a downstream LLM provider (OpenAI, Anthropic, etc.) is degraded, every agent in your fleet will hammer it until the connection pool is exhausted. Apply a circuit breaker at the LLM API client level:

- **Closed** (normal): All calls pass through. Track error rate over a 60s rolling window.
- **Open** (tripped): Error rate exceeded threshold (e.g., 50% of calls failed in last 60s). All calls fail immediately with `CircuitOpenError`. Prevents thundering herd against a degraded provider.
- **Half-open**: After a cooldown period (30–60s), allow one probe call. If it succeeds, close the circuit; if it fails, re-open.

**Provider fallback**: When the circuit is open, fall back to an alternate provider:
```
Primary: GPT-4o (OpenAI) → Fallback: Claude Sonnet (Anthropic) → Last resort: cached response
```

Track which provider each agent session started on and keep it consistent within a session (model switching mid-conversation degrades coherence).

## Observability for Agents

Each tool call should emit a span with:
- `agent.id`, `agent.step_index`
- `tool.name`, `tool.args_hash` (not raw args — may contain PII)
- `tool.latency_ms`, `tool.retry_count`
- `tool.error_type` (retryable / non-retryable / llm-specific)
- `tool.idempotency_key`

Alert on:
- Tool error rate > 5% per agent type (sustained over 5 minutes)
- Agent wall-clock budget exceeded rate > 1% (agents hitting timeout)
- LLM-specific error rate > 2% (model reliably hallucinating tool names → tool schema issue)
- Circuit breaker open events for LLM providers

## Architecture Diagram

```mermaid
flowchart TD
    Task["Agent Task\n(user intent)"] --> Orchestrator["LLM Orchestrator\n(probabilistic)"]

    Orchestrator --> Validator["Argument Validator\n(JSON schema check)"]
    Validator -->|"invalid args"| CorrectionPrompt["Correction Prompt\n(schema → model)"]
    CorrectionPrompt --> Orchestrator

    Validator -->|"valid"| ToolDispatch["Tool Dispatcher"]

    ToolDispatch --> IdempotencyCheck["Idempotency Key\nStore (Redis)"]
    IdempotencyCheck -->|"key exists"| CachedResponse["Return Cached Response"]
    IdempotencyCheck -->|"new key"| ToolExec["Tool Execution"]

    ToolExec -->|"retryable error"| Backoff["Exponential Backoff\n(attempt 1-4)"]
    Backoff --> ToolExec
    ToolExec -->|"non-retryable error"| DegradeLadder["Degradation Ladder\n(skip / downgrade / partial / fail)"]
    ToolExec -->|"success"| Checkpoint["Checkpoint State\n(step N complete)"]

    Checkpoint --> Orchestrator

    DegradeLadder --> Response["Final Response\n(with explicit gap notation)"]

    style Orchestrator fill:var(--surface),stroke:var(--accent2),stroke-width:2px
    style DegradeLadder fill:var(--surface),stroke:var(--accent),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **Max agent wall-clock budget**: `num_steps × avg_tool_latency × (1 + max_retries × avg_backoff)`. For 5 steps at 500ms each, 3 retries at 2s average backoff: 5 × (0.5 + 3 × 2) = 32.5s. Set budget at 60s to include orchestrator inference time.
- **Idempotency key store size**: 1 agent call × 10 steps × 1 key per step × 200 bytes/key = 2 KB/agent. At 10,000 concurrent agents: 20 MB. Trivial for Redis.
- **Retry storm mitigation**: At 1,000 agents all hitting a 429 simultaneously, without jitter, the retry wave hits in 3 synchronized bursts. With jitter (random delay ±50% of backoff interval), the retry load spreads across 3× the backoff interval — reducing peak retry RPS by ~3×.
- **LLM argument validation cost**: Running JSON schema validation before every tool call adds < 1ms. The cost of a bad tool call (model latency + retry + correction prompt) is 1–10s. Always validate; the overhead is negligible compared to the failure cost.
- **Checkpoint overhead**: Serializing 10KB of agent state to Redis takes < 5ms. For a 30-step agent chain, this adds 150ms total — acceptable for long-running agents, negligible for short ones.

## Real-World Case Studies

- **Stripe Agents (Dispute Resolution)**: Stripe's dispute resolution agents call 8–12 tools per dispute (fetch transaction, fetch customer history, look up merchant, generate response). They handle rate limiting from their own internal APIs using a token bucket with per-agent-type quotas, and use idempotency keys on all write operations (dispute response submission) to prevent duplicate submissions in cases where the network call times out after the server receives and processes the request.

- **GitHub Copilot Workspace**: Copilot Workspace's multi-step code generation agent handles tool failures (file read errors, build failures, test failures) as first-class signals, feeding the error output back to the model as tool results. The model uses the error as context to self-correct — a failed build output becomes the model's input for the next iteration. The maximum iteration count (5) prevents infinite self-correction loops on errors the model cannot fix.

- **Salesforce Agentforce**: Salesforce's Agentforce uses a fallback ladder for CRM tool calls: if a primary CRM API is rate-limited, it falls back to a read replica; if the read replica is unavailable, it uses a cached snapshot of the last successful pull (with an explicit "data as of [timestamp]" note in the response). This allows agents to continue serving users during API degradation with an explicit quality-of-data signal.

## Connections

- [[04-Phase-4-Modern-AI__Module-20-RAG-Agents-Realtime__Agentic_System_Architecture]] — Orchestration patterns (ReAct, plan-and-execute), multi-agent coordination, and tool use design; this note covers the reliability layer on top of those patterns
- [[04-Phase-4-Modern-AI__Module-19-AI-Inference-LLMOps__Semantic_Caching_and_Prompt_Caching]] — Caching tool results (level 2 of the degradation ladder) reuses semantic caching infrastructure
- [[03-Phase-3-Architecture-Operations__Module-16-Reliability-Testing__Circuit_Breakers_and_Bulkheads]] — Circuit breaker pattern for LLM APIs is the same pattern applied to any downstream dependency
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Idempotent_Consumers]] — Idempotency key design for agent tool calls mirrors idempotent message consumer design

## Reflection Prompts

1. Your agent calls a payment tool that charges a user's card. The tool call returns a network timeout — you don't know if the charge succeeded. Your retry logic is: "retry on timeout." Design the complete solution: idempotency key structure, what the payment tool must implement on the server side, and what the agent should tell the user if the second call also times out.

2. You're deploying an agent that uses 6 tools. After a week in production, your observability shows that tool `search_knowledge_base` has a 15% error rate, while the other 5 tools have < 1%. Walk through the diagnostic process: what error types would you look at first, what does a 15% LLM-argument-validation error rate tell you vs. a 15% 503 rate, and what's the fix for each?

3. A long-running agent (20 steps, ~90 seconds) crashes at step 15 due to an OOM error in the agent process. Without checkpointing, what happens? With checkpointing at each step, what happens? Estimate the user-facing latency difference between the two recovery strategies, and describe what "re-running from step 15" requires the tool infrastructure to guarantee.
