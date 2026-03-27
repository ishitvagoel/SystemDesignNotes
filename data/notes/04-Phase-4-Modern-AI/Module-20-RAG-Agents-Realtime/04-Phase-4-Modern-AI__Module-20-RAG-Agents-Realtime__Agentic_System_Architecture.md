# Agentic System Architecture

## Why This Exists

RAG retrieves information. Agents *act* on it. An agent is an LLM-powered system that can reason about a goal, make plans, use tools (APIs, databases, file systems), observe results, and iterate until the goal is achieved. This is the frontier of AI systems — and it introduces novel distributed systems challenges: tool orchestration, cost control per agent step, safety guardrails, and observability across multi-step reasoning chains.


## Mental Model

A detective with a toolkit. A regular LLM is an expert consultant sitting in a closed room — you slide questions under the door, they answer from memory, and sometimes their memory is wrong or outdated. An agent is a detective: they receive a case (user goal), reason about what they need to know, go out and investigate (use tools — search databases, call APIs, read files), observe the evidence, reason again, investigate further, and keep going until the case is solved. The power is in the loop: reason → act → observe → reason. The danger is also in the loop: a bad detective might chase false leads forever (infinite loops), break into the wrong house (tool misuse), or rack up enormous expenses (cost explosion).

## Agent Architecture Patterns

### Single-Agent (ReAct Loop)

The simplest pattern. One LLM in a Reason → Act → Observe loop:

1. **Reason**: "I need to find the user's order status. I'll query the orders database."
2. **Act**: Call the `get_order_status` tool with the order ID.
3. **Observe**: "The order is shipped, tracking number XYZ."
4. **Reason**: "I have the answer. I'll respond to the user."

The loop continues until the agent decides it has enough information to respond (or hits a step limit).

### Multi-Agent Vertical (Hierarchical Orchestration)

A coordinator agent delegates sub-tasks to specialist agents. The coordinator plans at a high level; specialists execute. Example: a research agent coordinates a web-search agent, a data-analysis agent, and a writing agent.

### Multi-Agent Horizontal (Peer Collaboration)

Agents collaborate as peers, passing messages to each other. No central coordinator. Each agent has a specialty and contributes to a shared goal. More complex to design but more resilient (no coordinator SPOF).

## Core Agent Modules

**Perception**: Interpreting inputs — text, images, structured data, tool outputs. The agent must understand what it's seeing.

**Reasoning/Planning**: Deciding what to do next. Chain-of-thought prompting, tree-of-thought for complex decisions, or explicit planning frameworks (plan → execute → replan).

**Memory**: Short-term (conversation context window) and long-term (retrieval from a vector store of past interactions, user preferences, learned facts). Memory enables agents to improve over time and maintain context across sessions.

**Action (Tool Use)**: Calling external tools — APIs, databases, code execution, web browsers. The agent generates a structured function call; the system executes it and returns the result.

**Feedback Loop**: The agent observes the result of its action and decides whether to continue, retry, or change strategy.

## Agent Communication Protocols

**MCP (Model Context Protocol — Anthropic, 2024)**: Now the dominant standard for connecting LLMs to external tools and data sources. MCP defines a client-server protocol where "MCP servers" expose tools, resources, and prompts that LLMs can discover and invoke. Adopted by Claude, Cursor, Windsurf, and hundreds of other tools. MCP servers exist for databases, APIs, file systems, Git, Slack, and most major SaaS platforms. The protocol supports tool discovery (the LLM learns what tools are available), schema introspection (understanding tool parameters), and streaming results.

**A2A (Agent-to-Agent — Google, 2025)**: A protocol for agents built by different providers to communicate, discover capabilities, negotiate tasks, and exchange results. While MCP connects an LLM to tools, A2A connects agents to each other — enabling multi-agent systems where a research agent from one provider can delegate tasks to a writing agent from another. Still early-stage.

These protocols are the interoperability layer for agentic systems — analogous to HTTP for web services.

## Guardrails and Safety

**Output validation**: Check agent outputs against a schema or ruleset before returning to the user. Reject hallucinated actions, out-of-scope tool calls, or harmful content.

**Human-in-the-loop checkpoints**: For high-stakes actions (sending emails, making payments, modifying databases), require human approval before execution. The agent proposes the action; the human confirms.

**Budget controls**: Limit tokens per agent run, tool calls per run, and total cost per session. A runaway agent in a loop can consume thousands of API calls.

**Sandboxing**: Tool execution should be sandboxed — the agent's code execution shouldn't access the host filesystem, network, or other users' data. Container-based sandboxing (E2B, Modal) provides isolation.

## Observability for Agentic Systems

Traditional observability (metrics, logs, traces) isn't sufficient. Agentic systems need:

- **Chain-of-thought tracing**: Log each reasoning step, tool call, and observation. The trace shows *why* the agent made each decision.
- **Tool call auditing**: Log every external tool invocation with inputs, outputs, and latency.
- **Token tracking**: Track tokens consumed per step, per agent, per session for cost attribution.
- **Cost attribution per agent step**: Which step consumed the most tokens? Which tool call was most expensive? This guides optimization.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Agent Loop (ReAct)"
        Goal[User Goal] --> Plan[Plan / Thought]
        Plan --> Act[Action: Tool Call]
        Act --> Obs[Observation: Result]
        Obs --> Plan
        Plan --> Final[Response]
    end

    subgraph "Tool Belt (MCP)"
        Act --> DB[(Database MCP)]
        Act --> Web[Search MCP]
        Act --> API[SaaS API MCP]
    end

    subgraph "Memory & State"
        Plan -.-> Short[Short-term: Context]
        Plan -.-> Long[Long-term: Vector DB]
    end

    style Plan fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Act fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Reasoning Depth**: Limit agents to **5 - 10 steps** per task. Most agents that haven't solved a problem in 10 steps are in an infinite loop.
- **Cost per Step**: A single reasoning step using GPT-4o typically costs **$0.01 - $0.05**. A 10-step agent run can cost **$0.50**.
- **Latency Multiplier**: Each agent step adds **2s - 5s** of latency (LLM generation + tool execution). A 5-step agent run takes **~15s - 25s**.
- **Tool Selection**: LLMs can reliably select from **~10 - 20 tools** provided in a single prompt. Beyond that, use a two-stage retrieval (RAG) to find relevant tool definitions first.

## Real-World Case Studies

- **Anthropic (MCP Adoption)**: Anthropic released the **Model Context Protocol (MCP)** to standardize how agents talk to tools. Companies like **Cursor** and **Windsurf** use MCP to give their AI coding agents secure access to your local filesystem, terminal, and git history, allowing them to fix bugs and run tests autonomously.
- **Salesforce (Agentforce)**: Salesforce built a platform where businesses can deploy thousands of autonomous agents to handle sales and service. They use a **Hierarchical Orchestration** model: a "Coordinator Agent" listens to the customer and delegates work to specialized "Action Agents" (e.g., a "Refund Agent" or a "Scheduling Agent"), ensuring strict governance and security boundaries.
- **HubSpot (Breeze)**: HubSpot uses agentic workflows to automate marketing tasks. They found that purely autonomous agents were too unpredictable for brand-sensitive work, so they use **Human-in-the-loop (HITL)** for every social media post the agent generates. The agent researches and drafts (Plan -> Act), but the "Send" action is gated by a human "Observe" step.

## Connections

- [[RAG Architecture]] — RAG is the retrieval component that many agents use for knowledge access
- [[AI Gateway and LLM Operations]] — The gateway manages token budgets, routing, and governance for agent LLM calls
- [[Observability and Alerting]] — Agent-specific observability extends traditional distributed tracing
- [[Semantic Caching and Prompt Caching]] — Agent tool results can be semantically cached; provider-side prompt caching reduces cost for repeated reasoning prefixes
- [[Idempotency]] — Tool calls with side effects require idempotency keys to support safe retry
- [[Agent Reliability Patterns]] — Detailed treatment of retry/backoff, idempotency key design, circuit breakers for LLM APIs, and the graceful degradation ladder

## Canonical Sources

- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (2023) — the ReAct pattern
- Anthropic MCP documentation (modelcontextprotocol.io) — the Model Context Protocol specification
- *Generative AI System Design Interview* by Alex Xu (2024) — agentic system design chapters

## Trade-Off Analysis

| Pattern | Flexibility | Reliability | Cost Control | Complexity |
|---------|------------|-------------|--------------|------------|
| Single agent (ReAct) | Low — one model does everything | Moderate — simple failure modes | Hard — unbounded reasoning steps | Low |
| Multi-agent vertical | High — specialist agents | Good — coordinator can retry/reroute | Moderate — coordinator controls budget | Medium |
| Multi-agent horizontal | Very high — emergent collaboration | Lower — no central failure handler | Hard — no single cost controller | High |
| Workflow (fixed DAG) | Low — predetermined steps | Highest — deterministic execution | Easiest — known step count | Lowest |
| Hybrid (workflow + agents) | High — agents within fixed structure | Good — bounded agent freedom | Good — budget per workflow step | Medium |

**The core tension**: Autonomy vs control. More autonomous agents can solve harder problems but are harder to predict, debug, and cost-control. Production systems almost always start with constrained workflows and add agent autonomy selectively.

## Failure Modes

**Infinite loops**: An agent that can't make progress retries the same action forever, burning tokens and time. Solution: hard step limits (e.g., max 10 reasoning steps), loop detection (if the same tool is called with the same arguments twice, break), and cost circuit breakers.

**Tool misuse**: The agent calls a tool with wrong arguments or calls the wrong tool entirely. A `delete_user` call when it meant `get_user` is catastrophic. Solution: tool descriptions with explicit examples, argument validation schemas, destructive actions require confirmation, and read-only mode by default.

**Hallucinated tool calls**: The agent calls a tool that doesn't exist or fabricates API responses instead of actually calling the tool. Solution: strict function calling mode, validate tool names against the allowed set, and verify tool outputs actually came from execution.

**Context window exhaustion**: Multi-step agents accumulate context (reasoning, tool outputs, observations) until the context window fills. Solution: summarization of intermediate steps, sliding window over recent history, or hierarchical memory (store in vector DB, retrieve on demand).

**Cost explosion**: An agent solving a complex problem might chain 50+ LLM calls, each with a long context. A single user query could cost $5-50. Solution: per-request cost budgets, step limits, cheaper models for intermediate reasoning steps, and caching of tool results.

**Cascading agent failures in multi-agent systems**: Agent A depends on Agent B's output. B fails, A retries, B fails again. Solution: timeout budgets per agent, fallback strategies (use cached result, use simpler approach), and circuit breakers between agents.

**Security: prompt injection via tool outputs**: An agent reads a web page that contains hidden instructions ("ignore previous instructions and..."). The agent follows the injected instructions. Solution: output sanitization, separate the "inner" and "outer" context, and use models with better instruction hierarchy adherence.

## Resilience Patterns for Agent Tool Calls

Agentic tool calls are distributed system calls — they fail. Unlike LLM reasoning (which is deterministic given the same input), tool calls hit live APIs, databases, and services that are subject to transient failures, rate limits, and timeouts. Agents need the same resilience patterns as microservices.

### Tool Call Idempotency

Non-idempotent tool calls (those with side effects: sending emails, charging cards, writing to databases) must be made idempotent before an agent can safely retry them. Pass an **idempotency key** with every write tool call — a UUID generated by the agent at the start of the step. If the agent retries the call after a timeout (unsure if the first call succeeded), the tool uses the idempotency key to deduplicate: same key → return the original result, don't re-execute.

**The critical rule**: Never retry a non-idempotent tool call without an idempotency key. If the first call succeeded but the response was lost in transit, a blind retry will double-charge, double-send, or double-write.

### Retry with Backoff for Transient Failures

Tool failures fall into two categories:
- **Retryable**: `UNAVAILABLE`, `RESOURCE_EXHAUSTED` (rate limit), `DEADLINE_EXCEEDED` — transient failures that usually resolve
- **Non-retryable**: `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `NOT_FOUND` — the call is wrong; retrying will always fail

For retryable failures: exponential backoff with jitter. Start at 1 second; double each retry; add random jitter (±20%) to prevent thundering herd. Max 3–5 retries. Cap delay at 30 seconds.

```
retry 1: wait 1s (±0.2s)
retry 2: wait 2s (±0.4s)
retry 3: wait 4s (±0.8s)
→ give up, return error to agent reasoning
```

The agent reasoning layer then decides: did a critical tool fail? Should it try an alternative approach? Should it return a partial result with an explanation?

### Graceful Degradation: Fallback Strategies

Not all tool failures should abort the agent's task. Design fallback hierarchies:

1. **Retry the same tool** (transient failure)
2. **Try an alternative tool** (e.g., if `web_search_primary` fails, try `web_search_backup`)
3. **Use cached tool output** if the data is acceptable to be slightly stale
4. **Proceed without the tool** if the tool was optional (the agent can still give a partial answer)
5. **Return explicit uncertainty** ("I couldn't verify this because the database is temporarily unavailable")
6. **Escalate to human** (for critical paths where proceeding on incomplete info is unacceptable)

The agent's reasoning prompt should explicitly tell the model what to do on each tool failure. Without this instruction, models tend to hallucinate successful tool calls or silently proceed without the tool's data.

## Reflection Prompts

1. You're designing a customer support agent that can look up orders, issue refunds, and escalate to humans. What tool permissions does it need? What actions should require human approval? How do you prevent a prompt injection attack via a malicious order note?
2. Compare a ReAct agent vs a fixed workflow for "research a topic and write a report." When does the agent's flexibility justify its unpredictability and cost? When would a fixed pipeline produce better results?
3. Your multi-agent system has a research agent, a writing agent, and a fact-checking agent. The research agent returns incorrect information. How should the fact-checking agent handle this? What if the research agent and fact-checker disagree?

## Canonical Sources

- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (2022)
- Anthropic, "Model Context Protocol (MCP)" — https://modelcontextprotocol.io
- Google, "Agent2Agent Protocol (A2A)" (2025)
- Harrison Chase, "LangGraph: Multi-Agent Workflows" — LangChain documentation
- Andrew Ng, "Agentic Design Patterns" (2024)
