# Event-Driven Architecture Patterns

## Why This Exists

"Event-driven architecture" is used loosely to describe at least four distinct patterns, each with different coupling characteristics, data flow implications, and failure modes. An engineer who says "let's use events" without specifying which pattern is like saying "let's use a database" without specifying relational vs document vs graph — the implementation implications are vastly different.

Martin Fowler distinguishes three EDA patterns for inter-service communication. A fourth (event sourcing) is covered in [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Event_Sourcing_and_CQRS]]. Understanding which pattern you're actually using prevents architectural confusion and mismatched expectations.


## Mental Model

Three styles of gossip. **Event notification**: "Hey, something happened at the Smith house." You know something changed, but you need to go look to find out what (thin events, recipient queries for details). **Event-carried state transfer**: "The Smiths just painted their house blue, replaced the roof with slate, and added a garage." You have all the details and never need to ask (fat events, no callbacks needed). **Event sourcing**: You keep a diary of every change to every house in the neighborhood, forever. You can reconstruct any house's state at any point in time. Each style trades off message size, coupling, and the ability to reconstruct history.

## The Three Integration Patterns

### Event Notification

The producer publishes a lightweight event: "something happened." The event carries minimal data — typically just an entity ID and event type. Consumers who need more details fetch the full data from the producer's API.

```
Producer publishes: { type: "OrderCreated", order_id: "123" }
Consumer receives event, calls: GET /orders/123 → full order details
```

**Why choose this**: Maximum decoupling at the schema level. The event schema is tiny — just an ID and a type. The producer doesn't need to know what consumers need. Adding a new consumer requires no changes to the producer (the consumer calls the existing API).

**The hidden coupling**: Consumers are coupled to the producer at *runtime* — they must call back to the producer's API for data. If the producer is down, consumers can't process events. If 10 consumers receive the same event, the producer gets 10 API calls for the same data. This is an N+1 problem at the infrastructure level.

**When it works well**: Low-volume events where the callback cost is acceptable. Notifications ("hey, something changed, go check if you care"). Triggering workflows that need the freshest data (the callback always gets the current state).

### Event-Carried State Transfer

The event carries all the data consumers might need. No callback required.

```
Producer publishes: {
  type: "OrderCreated",
  order_id: "123",
  user_id: "456",
  items: [{ product_id: "789", name: "Widget", quantity: 2, price: 9.99 }],
  total: 19.98,
  shipping_address: { street: "123 Main St", city: "Springfield", ... }
}
```

**Why choose this**: Full runtime decoupling. Consumers have all the data they need in the event. If the producer is temporarily down, consumers can still process events from the queue/topic — the data is self-contained. No callback latency. No N+1 problem.

**The coupling it introduces**: Schema coupling. The event must include data for all consumers. If the shipping service needs the address and the analytics service needs the price breakdown, both fields must be in the event. The producer must anticipate what consumers need — or include everything and let consumers ignore what they don't use.

**Schema evolution is critical**: Events are often stored durably (Kafka retention). Old events have old schemas. New consumers must handle old event formats. This is exactly the [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] problem — and it's why Avro/Protobuf with a schema registry are essential for event-carried state transfer at scale.

**Consumers build local views**: Each consumer typically stores a local copy of the data it needs (a "projection" or "materialized view"). The notification service stores user names and email addresses from UserCreated events. The recommendation service stores purchase history from OrderCreated events. Each service's local data is eventually consistent with the source of truth.

**This is denormalization at the system level.** The same data exists in multiple services' databases — each shaped for its own query patterns. The trade-offs are the same as [[01-Phase-1-Foundations__Module-05-Data-Modeling__Relational_Modeling_and_Normalization|relational denormalization]]: faster reads, more storage, and the risk that copies drift if events are lost or processed out of order.

**When it works well**: High-volume events where callback latency is unacceptable. Services that need to build and maintain their own views of data (search indexes, caches, analytics stores). Systems where runtime independence is critical (the consumer must work even if the producer is down).

### Change Data Capture (CDC)

A special case of event-carried state transfer where the events are generated from the database's [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] rather than application code. Every insert, update, and delete in the database is captured and published as an event.

**Tools**: Debezium (the standard), AWS DMS, Maxwell (for MySQL).

**Why CDC instead of application-published events**: The application might update the database but fail to publish the event (crash, bug, [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern|outbox]] not implemented). CDC reads the WAL — if the data is in the database, the event is published. There's no gap between "data written" and "event published."

**The trade-off**: CDC events are database-schema-level (table names, column names, row values), not domain-level (OrderCreated, PaymentProcessed). Consumers must map from database schema to domain concepts. If the database schema changes (column rename), CDC events change — consumers break. The [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]] bridges this: write domain events to an outbox table, and CDC captures domain-level events from that table.

## Decision Framework

| Pattern | Schema Coupling | Runtime Coupling | Data Freshness | Best For |
|---------|----------------|-----------------|----------------|----------|
| Event Notification | Lowest | High (callbacks) | Always current (callback fetches latest) | Low-volume triggers, notifications |
| Event-Carried State Transfer | Medium (event schema) | None (self-contained) | Eventually consistent (event processing lag) | High-volume, runtime-independent consumers |
| CDC | High (DB schema) | None | Eventually consistent (WAL lag) | Data replication, search indexing, analytics |
| Outbox + CDC | Medium (outbox schema) | None | Eventually consistent | Reliable domain event publishing |

## Anti-Patterns

**Event soup**: Every microservice publishes events for everything. The event bus has 500 event types. Nobody knows what events are available, what schema they use, or who consumes them. New engineers are overwhelmed. Mitigation: an event catalog (schema registry + documentation), ownership per event type, and the discipline to ask "does this really need to be an event?" before publishing.

**Temporal coupling via events**: Service A publishes OrderCreated. Service B processes it and publishes InventoryReserved. Service C waits for both OrderCreated AND InventoryReserved before proceeding. This is a distributed saga implemented implicitly through event choreography — but nobody can see the full flow. The dependencies are hidden in consumer subscriptions. Mitigation: if the flow is a saga, make it explicit with an [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern|orchestrator]].

**Event ordering assumptions**: Consumer assumes events arrive in order. But if the producer publishes to multiple Kafka partitions, or events are retried out of order, the consumer sees OrderUpdated before OrderCreated. Mitigation: design consumers to handle out-of-order events (check for existence before applying updates, use event timestamps for ordering, or ensure causal events go to the same partition).

## Trade-Off Analysis

| Pattern | Coupling | Ordering | Delivery Guarantee | Complexity | Best For |
|---------|---------|---------|-------------------|------------|----------|
| Request-response (synchronous) | High — caller knows callee | N/A — sequential | Exactly-once (within transaction) | Low | Simple CRUD, user-facing APIs |
| Pub/sub (fire-and-forget) | Low — publisher doesn't know subscribers | No ordering guarantees | At-most-once or at-least-once | Low | Notifications, cache invalidation, fanout |
| Event streaming (log-based) | Low — consumers pull from log | Per-partition ordering | At-least-once (with idempotent consumers, effectively-once) | Medium | Event sourcing, CDC, audit trails |
| Event choreography | Very low — services react to events | Eventual, partial ordering | At-least-once | High — emergent behavior, hard to trace | Loosely coupled microservices, simple workflows |
| Event orchestration | Medium — orchestrator coordinates | Orchestrator-defined | At-least-once | Medium — centralized workflow | Complex business processes, sagas |

**The observability tax of event-driven systems**: Synchronous request-response gives you a stack trace. Event-driven gives you correlation IDs scattered across services and logs. Before going event-driven, invest in distributed tracing (OpenTelemetry), structured logging, and a dead-letter queue strategy. Without these, debugging a failed event flow across five services will take hours instead of minutes.

## Failure Modes

**Undetected event ordering violation**: A consumer receives "OrderShipped" before "OrderCreated" due to partition rebalancing or retry mechanics. The consumer crashes or produces incorrect state (shipping an order that doesn't exist in its local state). Solution: per-entity ordering (route all events for the same entity to the same partition), or consumer-side buffering that waits for prerequisites before processing.

**Ghost events after rollback**: A service publishes an event, then the database transaction that generated it rolls back. The event is already on the bus — consumers process an event for a state change that never happened. Solution: transactional outbox pattern (event published only if the transaction commits), or listen to the database's WAL for committed changes only (CDC).

**Event consumer backlog cascade**: A slow consumer falls behind on event processing. Events accumulate. The consumer tries to catch up but the backlog keeps growing. If the event retention period expires, the consumer loses events entirely. Solution: monitor consumer lag as a critical metric, auto-scale consumers based on lag, and set retention periods longer than the maximum acceptable catch-up time.

**Poison event blocking consumer**: A single event causes the consumer to throw an exception. The consumer retries the event, fails again, retries again — stuck in an infinite loop. All subsequent events for that partition are blocked. Solution: dead-letter queue after N retries, alert on DLQ depth, and build tooling to inspect, fix, and replay dead-lettered events.

**Event schema breakage**: A producer changes an event's schema (removes a field, changes a type) without coordinating with consumers. Consumers fail to deserialize the event. Solution: schema registry with backward compatibility enforcement (Avro + Confluent Schema Registry), semantic versioning for events, and CI checks that validate schema compatibility before deployment.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Event Notification (Thin)"
        P1[Producer] -->|1. notify: ID=123| B1[Broker]
        B1 --> C1[Consumer]
        C1 -->|2. GET /data/123| P1
    end

    subgraph "Event-Carried State Transfer (Fat)"
        P2[Producer] -->|1. publish: Full Data| B2[Broker]
        B2 --> C2[Consumer]
        C2 -->|2. Update Local View| C2_DB[(Local DB)]
    end

    subgraph "CDC / Outbox (Reliable)"
        P3[Producer] -->|1. Write| P3_DB[(Outbox Table)]
        P3_DB -.->|2. Tail WAL| Relay[Relay]
        Relay -->|3. publish| B3[Broker]
    end

    style B2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style P3_DB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Event Size**: Keep individual events under **1MB** (default Kafka limit). Ideally, events should be **1KB - 10KB** for maximum throughput.
- **Throughput**: A well-tuned Kafka cluster can handle **100k to 1M+ messages/sec** per topic.
- **Latency**: End-to-end publish/consume latency on an event stream is typically **10ms - 50ms**.
- **Retention**: Start with **7 days** of event retention for standard topics, allowing enough time to fix broken consumers and replay weekend failures.

## Real-World Case Studies

- **Uber (Event-Driven Pricing)**: Uses an event-driven architecture built on Kafka to calculate surge pricing. Geospatial events (driver locations), ride requests, and driver availability are streamed and aggregated in real-time. This is a mix of **Event-Carried State Transfer** (for locations) and **Event Notification** (for pricing triggers).
- **LinkedIn (Databus)**: LinkedIn created Databus to solve the search index sync problem. They used **CDC** to capture changes from Oracle/MySQL and distribute them as full-state events to downstream systems like the search index and cache invalidation services, ensuring eventual consistency across their entire data stack.
- **Netflix (Workflow Triggers)**: Netflix uses **Event Notification** to trigger complex asynchronous media encoding pipelines. When a video is uploaded, a tiny event kicks off parallel processing across hundreds of microservices. Each microservice then calls back to the "Source of Truth" to get the specific bits of metadata it needs.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Message_Queues_vs_Event_Streams]] — The transport layer for these patterns
- [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Event_Sourcing_and_CQRS]] — Event sourcing uses events as the source of truth, not just an integration mechanism
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Saga_Pattern]] — Choreography sagas use event notification or event-carried state transfer
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] — Event-carried state transfer requires careful schema management
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]] — Reliable domain event publishing combining the best of application events and CDC
- [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Service_Decomposition_and_Bounded_Contexts]] — Events are the primary integration mechanism between bounded contexts

## Reflection Prompts

1. Your order service publishes OrderCreated events using event notification (just the order ID). Three consumers call back to the order service's API for full details. During a Black Friday traffic spike, the order service is overwhelmed by these callback requests. How do you fix this without rewriting all consumers? What's the long-term architectural change?

2. You're using CDC (Debezium) to replicate data from the orders table to an Elasticsearch index for search. A developer renames the `customer_name` column to `buyer_name`. What happens to the search index? How would the outbox pattern prevent this?

## Canonical Sources

- Fowler, "What do you mean by 'Event-Driven'?" (blog post, 2017) — distinguishes the three EDA patterns
- *Building Microservices* by Sam Newman (2nd ed) — Chapter 6 covers event-driven communication
- Debezium documentation — the standard CDC platform
- *Microservices Patterns* by Chris Richardson — Chapters on event-driven communication and the outbox pattern