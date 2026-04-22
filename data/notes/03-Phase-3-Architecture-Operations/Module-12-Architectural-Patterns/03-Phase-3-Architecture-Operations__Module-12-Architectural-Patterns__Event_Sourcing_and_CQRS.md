# Event Sourcing and CQRS

## Why This Exists

Traditional CRUD stores the current state. When you update a user's email, the old email is overwritten. The history is lost. Event sourcing flips this: instead of storing current state, store the sequence of events that led to that state. The current state is derived by replaying events.

CQRS (Command Query Responsibility Segregation) separates the write model (commands that produce events) from the read model (optimized views built from events). Together, event sourcing + CQRS provide a complete audit trail, temporal queries ("what was the state on Tuesday?"), and independently scalable read/write paths. But they add significant complexity — and are only warranted when that complexity pays for itself.


## Mental Model

**Event Sourcing**: Your bank doesn't store "your balance is ₹50,000." It stores every transaction: +₹100,000 salary, -₹30,000 rent, -₹20,000 groceries. Your current balance is derived by replaying all transactions. This means you can answer questions a balance-only system never could: "What was my balance on March 1st?" or "What if I hadn't paid that subscription?" The event log is the source of truth; the current balance is just a cached view.

**CQRS**: Now imagine your bank has two windows — one for deposits and withdrawals (writes), one for checking your balance and statements (reads). The deposit window talks to the secure vault. The inquiry window talks to a fast display board that gets updated from the vault. Separating the write model (optimized for correctness) from the read model (optimized for speed and shape) lets you optimize each independently.

## Event Sourcing

### How It Works

Instead of `UPDATE accounts SET balance = 950 WHERE id = 1`, you append an event: `{type: "MoneyWithdrawn", account_id: 1, amount: 50, timestamp: "..."}`.

The current balance is computed by replaying all events for that account:

```
AccountCreated(balance: 1000)  →  balance = 1000
MoneyDeposited(amount: 200)    →  balance = 1200
MoneyWithdrawn(amount: 50)     →  balance = 1150
MoneyWithdrawn(amount: 200)    →  balance = 950
```

Events are **immutable** — once written, they're never modified or deleted. Corrections are modeled as new events (e.g., "WithdrawalReversed").

### When It Shines

- **Audit requirements**: Financial systems, healthcare, legal — anywhere you need a complete, immutable history of every state change.
- **Temporal queries**: "What was the inventory count at 3pm yesterday?" Replay events up to that timestamp.
- **Event-driven architecture**: Events are the natural integration point between services. The event log IS the integration layer.
- **Debugging production issues**: Replay events to reproduce the exact state that led to a bug. No guessing about "what happened."

### When It Hurts

- **Simple CRUD**: If your application is just create/read/update/delete with no audit needs, event sourcing adds complexity for zero benefit.
- **Querying**: "Show me all users with balance > $1000" requires replaying every user's events to compute their balance. This is why CQRS exists — you build optimized read models.
- **Schema evolution**: Events are immutable. If the event schema changes, old events still have the old schema. You need upcasting (transforming old events to the new schema on read) or versioned event handlers. See [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]].
- **Event log growth**: The log grows forever. Snapshotting (periodically storing the computed state, replaying only events after the snapshot) mitigates this, but adds complexity.

## CQRS

### How It Works

Separate the write path (commands) from the read path (queries):

- **Write side**: Accepts commands, validates them, produces events, stores events in the event store.
- **Read side**: Consumes events, builds **projections** (materialized views optimized for specific query patterns), serves queries from projections.

The read side can have multiple projections: one for the user dashboard, one for admin search, one for analytics. Each is optimized for its query pattern. A projection can use a different database than the event store — events in Kafka, projections in Postgres, Elasticsearch, or Redis.

### The Consistency Trade-Off

The read model is eventually consistent with the write model. After a command produces an event, there's a delay before the projection is updated. A user who creates an order might not immediately see it in their order list (the projection hasn't processed the event yet).

This is the same [[02-Phase-2-Distribution__Module-08-Consistency-Models__Session_Guarantees]] problem from Module 8 — and the same solutions apply: read-your-writes routing, polling until the projection catches up, or accepting the lag with appropriate UI (optimistic updates).

### CQRS Without Event Sourcing

CQRS doesn't require event sourcing. You can have a traditional database for writes and a separate read-optimized store (read replica, Elasticsearch, materialized view) that's updated via CDC or application-level synchronization. This gives you the read/write separation benefit without event sourcing's full complexity.

## Trade-Off Analysis

| Pattern | Query Flexibility | Write Simplicity | Storage Cost | Consistency | Best For |
|---------|------------------|-----------------|-------------|-------------|----------|
| CRUD (traditional) | Full — query current state directly | Simple — update in place | Low — one copy of state | Strong — single source | Most OLTP applications, simple domains |
| Event sourcing only | Limited — must replay or project | Simple — append-only | High — all events stored forever | Eventual (projections lag) | Audit-critical systems, financial ledgers |
| CQRS only (no event sourcing) | Excellent — optimized read models | Moderate — separate write/read paths | Moderate — duplicated data | Eventual between write and read sides | Read-heavy APIs with complex query patterns |
| Event sourcing + CQRS | Excellent — arbitrary projections | Simple writes, complex infrastructure | High | Eventual | Complex domains needing full audit + flexible queries |

**When event sourcing isn't worth it**: If you don't need a full audit trail, temporal queries ("what was the state at time T?"), or the ability to replay events to build new projections, event sourcing adds significant complexity for no benefit. The rebuild-from-events guarantee is powerful but requires careful event schema evolution and can take hours for large event stores. Most CRUD applications should stay CRUD.

## Failure Modes

**Event schema evolution breaking replay**: An event schema changes (new field, renamed field, changed semantics). Replaying the event log from the beginning fails because old events don't conform to the new schema. Projections built from replayed events produce incorrect state. Solution: version your events, maintain upcasters that transform old event versions to current, and never modify the meaning of existing event fields — add new fields instead.

**Projection rebuild taking hours**: The event store has 500M events. Rebuilding a projection from scratch takes 8 hours. During this time, the read model is stale or unavailable. If the rebuild fails partway, you start over. Solution: take periodic snapshots of projections, rebuild from the latest snapshot rather than from event 0, parallelize replay across partitions, and test rebuild time regularly.

**Eventual consistency confusion in UI**: A user creates an order (command accepted, event published), then immediately views their orders (queries the read model). The projection hasn't processed the event yet — the new order is missing. The user creates it again, resulting in a duplicate. Solution: return the command's event sequence number to the client, and have the read endpoint wait until the projection has processed at least that sequence number before responding.

**Event store as a performance bottleneck**: All writes go through the event store, and all projections consume from it. Under high write load, projection consumers fall behind. The event store's retention policy conflicts with projection rebuild needs. Solution: partition the event store by aggregate ID, use separate consumer groups for each projection, implement back-pressure so slow projections don't affect writes, and archive old events to cold storage with a compacted snapshot.

**Compensation event complexity explosion**: In event sourcing, you can't "undo" an event — you append a compensating event. But compensating events can trigger further downstream effects. Canceling an order might trigger: refund event, inventory restore event, notification event, loyalty points reversal event. Each of these might trigger further compensations in other services. Solution: design compensation as a coordinated saga, not a cascade of independent events. Model the compensation flow explicitly.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Write Side (Commands)"
        User[User] -->|1. Submit Order| API[Command API]
        API -->|2. Validate| Agg[Order Aggregate]
        Agg -->|3. Append| Store[(Event Store)]
    end

    subgraph "Async Projection"
        Store -.->|4. Stream Events| Proj[Projection Engine]
        Proj -->|5. Update| ReadDB[(Read DB: Postgres/Elastic)]
    end

    subgraph "Read Side (Queries)"
        User2[User] -->|6. View Orders| Q_API[Query API]
        Q_API -->|7. Fetch| ReadDB
    end

    style Store fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style ReadDB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Write Performance**: Appending to an event log is an **O(1)** sequential write. It can handle **10x-100x higher write volume** than traditional B-tree updates.
- **Read Lag**: Standard projection lag is **< 100ms** under normal load. If lag exceeds **5 seconds**, user-facing UIs usually require "loading" indicators or polling.
- **Storage Multiplier**: Event sourcing can consume **5x-20x more storage** than CRUD because it stores every version of every record forever.
- **Replay Speed**: Replaying 1 million events to rebuild a read model typically takes **1 - 10 minutes** depending on the complexity of the projection logic.

## Real-World Case Studies

- **LMAX Exchange (Mechanical Sympathy)**: LMAX, a high-performance retail financial exchange, pioneered many event sourcing concepts. They needed to process **6 million orders/sec** with sub-millisecond latency. They used an in-memory event store and the "Disruptor" pattern to ensure that the sequential processing of events was the only way to maintain the speed required for high-frequency trading.
- **Microsoft (Halo Leaderboards)**: The game Halo uses CQRS to manage its global leaderboards. Player matches (writes) generate millions of events per hour. These are processed into various "read models" (global rank, friend rank, regional rank). By separating the match-processing from the ranking-queries, they ensure that a spike in players doesn't slow down someone trying to check their score.
- **The New York Times (The Publishing Pipeline)**: The NYT uses Kafka as its "Event Store" for all published content. Every article edit, image upload, and metadata change is an event. This allows them to rebuild their entire website or mobile app search index from scratch by just "rewinding" the Kafka log and re-playing all article events into a new database.

## Connections

- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] — The WAL is conceptually an event log; event sourcing makes this explicit at the application level
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern]] — Sagas are natural in event-sourced systems: each saga step produces events
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]] — Events can be published via outbox for reliable delivery to projections and other consumers
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] — Event schema evolution is especially challenging because events are immutable
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Relational_Modeling_and_Normalization]] — Projections are denormalized read models; the event log is the normalized source of truth

## Reflection Prompts

1. Your event-sourced system has been running for 3 years with 2 billion events. You discover that an event published 18 months ago had a bug — `OrderTotalCalculated` events used the wrong tax rate for California orders. You can't modify historical events (immutability). How do you correct the state, and what does this tell you about the operational complexity of event sourcing?

2. A new product feature requires a read model that didn't exist when the events were originally designed. The existing events don't contain all the information the new projection needs. You can add the missing data to future events, but the projection needs to be backfilled from historical events that lack it. How do you handle this gap?

3. Your CQRS system has a 500ms average lag between the write side (event store) and the read side (projections). A user places an order, then immediately navigates to "My Orders." The projection hasn't caught up — the order isn't there. The user clicks "Place Order" again. How would you prevent this without sacrificing the eventual consistency model?

## Canonical Sources

- *Microservices Patterns* by Chris Richardson — Chapters 6–7 cover event sourcing and CQRS patterns
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 11: "Stream Processing" discusses event sourcing as a special case of stream processing
- Greg Young, "CQRS and Event Sourcing" (various talks) — the originator of the CQRS pattern
- Jay Kreps, "The Log" blog post — the log as the unifying abstraction connecting databases, event sourcing, and stream processing