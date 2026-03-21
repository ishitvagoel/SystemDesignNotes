# Idempotent Consumers

## Why This Exists

Every reliable message delivery system delivers at-least-once. Kafka redelivers after consumer rebalances. SQS redelivers after visibility timeout. RabbitMQ redelivers after NACK or channel close. The [[Outbox Pattern]] publishes at-least-once. Saga retries deliver at-least-once.

If your consumer isn't idempotent, every redelivery risks duplicate side effects: double charges, duplicate emails, duplicated inventory reservations. Idempotent consumers are not optional in distributed systems — they're a requirement.

This note extends the [[Idempotency]] concepts from Module 2 (API-level) to the message consumer context.


## Mental Model

A doorman with a guest list. Guests arrive at the party (messages arrive at the consumer). Some guests get impatient and show their invitation twice (message redelivery). A regular doorman might let the same guest in twice, causing confusion (duplicate processing). An idempotent doorman checks every invitation against a list of who already entered. "You're already inside, sir" — and the duplicate is harmlessly ignored. The guest list is the idempotency store (a set of processed message IDs), and the doorman's check-then-admit is the deduplication logic. The cost is maintaining the guest list (storage) and checking it for every arrival (latency).

## Strategies

### 1. Message ID Tracking (Deduplication Table)

Store processed message IDs in a database table. Before processing, check if the ID exists. If yes, skip. If no, process and insert — atomically.

```sql
-- In the same transaction as business logic:
INSERT INTO processed_messages (message_id, processed_at)
VALUES ('msg-abc-123', NOW())
ON CONFLICT (message_id) DO NOTHING;
-- If INSERT affected 0 rows → duplicate, skip processing
```

**Strengths**: General-purpose, works for any message type. The database enforces uniqueness via a unique constraint — race conditions are handled atomically.

**Weaknesses**: Requires a database write per message (overhead). The `processed_messages` table grows unboundedly — needs periodic cleanup (delete entries older than the maximum redelivery window). Adds latency (database round-trip for every message).

**Key detail**: The dedup check and the business logic MUST be in the same database transaction. If they're separate, a crash between the dedup insert and the business logic means the message is marked as processed but never actually processed.

### 2. Natural Idempotency

Design the operation so that repeating it has no additional effect:

- **Absolute writes**: `SET balance = 500` is idempotent (repeating it yields the same result). `ADD 50 TO balance` is NOT idempotent (repeating it adds 50 again).
- **Upserts**: `INSERT ... ON CONFLICT DO UPDATE SET ...` — creates the record if it doesn't exist, updates it if it does. Repeating the upsert produces the same final state.
- **Status transitions**: `UPDATE orders SET status = 'shipped' WHERE id = 123 AND status = 'processing'` — the WHERE clause ensures the update only applies once. A redelivery hits the WHERE clause (status is already 'shipped'), updates zero rows, and is effectively a no-op.

**Strengths**: No deduplication infrastructure. The most elegant approach when it works.

**Weaknesses**: Not every operation is naturally idempotent. Side effects (sending emails, calling external APIs) are inherently not idempotent — you must use another strategy for those.

### 3. Idempotency Key per Side Effect

For non-idempotent side effects (external API calls, emails), use an idempotency key passed to the downstream system:

```
process_message(msg):
    idempotency_key = msg.id + "_payment"
    payment_service.charge(
        amount=msg.amount,
        idempotency_key=idempotency_key
    )
```

The downstream system (payment service) deduplicates using the idempotency key ([[Idempotency]]). The consumer doesn't need its own dedup table — it delegates deduplication to the service that owns the side effect.

### 4. Transactional Offset Commit (Kafka Exactly-Once)

Kafka provides "exactly-once semantics" (EOS) by tying message consumption to production in a single Kafka transaction:

- Consumer reads message from input topic
- Consumer processes message and produces to output topic
- Consumer commits the consumption offset and the production in a single Kafka transaction

If the consumer crashes mid-processing, the Kafka transaction is rolled back — both the output message and the offset commit are undone. On restart, the consumer re-reads and reprocesses.

**Limitation**: This only works for Kafka-to-Kafka processing pipelines. If the consumer's side effect is a database write or an external API call, Kafka EOS doesn't help — you're back to at-least-once with application-level idempotency.

## Choosing a Strategy

| Scenario | Best Strategy |
|----------|--------------|
| Database writes | Natural idempotency (upserts, conditional updates) |
| External API calls | Idempotency key delegation |
| Kafka → Kafka processing | Kafka EOS (transactional produce + consume) |
| Complex processing with multiple side effects | Message ID tracking (dedup table) |
| General-purpose, unknown consumers | Message ID tracking as a safety net |

## Trade-Off Analysis

| Idempotency Strategy | Storage Cost | Latency Overhead | Dedup Window | Best For |
|---------------------|-------------|-----------------|-------------|----------|
| Natural idempotency (UPSERT, SET) | None — operation is inherently safe | None | Infinite | Database writes, cache sets, state machines |
| Idempotency key table (DB) | One row per request | One DB read per request | Configurable (TTL on rows) | API endpoints, payment processing |
| Idempotency key in Redis | One key per request | One Redis lookup per request | TTL-based | High-throughput dedup, short windows |
| Conditional writes (version/ETag) | Stored with entity | None extra — part of write path | Infinite | Optimistic concurrency, document updates |
| Deduplication log (Kafka) | Compacted topic overhead | One lookup per message | Depends on compaction | Stream processing, exactly-once semantics |

**Design for natural idempotency first**: If you can model your operation as "set state to X" instead of "increment by 1," you don't need a dedup table at all. `UPDATE balance SET amount = 500 WHERE id = 123` is naturally idempotent. `UPDATE balance SET amount = amount + 50` is not. State-based operations are always safer than delta-based operations in distributed systems.

## Failure Modes

- **Dedup table lookup miss due to cleanup**: You clean up the dedup table (delete entries older than 7 days). A message redelivered after 8 days passes the dedup check and is processed again. Mitigation: set the cleanup window to exceed the maximum possible redelivery delay. For Kafka, this is the consumer group's offset retention (default 7 days). Add margin.

- **Non-idempotent side effects missed**: A developer adds a new side effect (send a webhook notification) to an existing consumer without making it idempotent. Duplicates result in duplicate webhooks. Mitigation: code review checklist — every consumer side effect must be idempotent or protected by a dedup mechanism.

- **Partial processing**: Consumer processes half the message (writes to database) then crashes before committing the dedup entry. On redelivery, the dedup check passes (no entry) and the message is processed again — duplicating the database writes. Mitigation: the dedup entry and business writes MUST be in the same transaction.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Messaging Infrastructure"
        Broker[Message Broker: Kafka/SQS] -->|1. Deliver (At-least-once)| Consumer[App Consumer]
    end

    subgraph "Idempotent Logic (Atomic Transaction)"
        Consumer -->|2. Check/Insert ID| DedupTable[Dedup Table: processed_msgs]
        DedupTable -- "ID Exists" --> Skip[Discard Duplicate]
        DedupTable -- "New ID" --> BizLogic[Business Logic: Update DB]
        BizLogic -->|3. Commit Both| DB[(Primary Database)]
    end

    subgraph "External Side Effects"
        BizLogic -->|4. Call with ID| Notify[Email/Payment Svc]
    end

    style Consumer fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style DB fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Dedup TTL**: Keep message IDs for **7 - 14 days**. Most redeliveries happen within seconds, but rebalances or backup restores can trigger older redeliveries.
- **Index Overhead**: A unique index on `message_id` (UUID) adds **~32-64 bytes** per message. Storing 100M IDs consumes **~6GB - 10GB** of index space.
- **Transaction Impact**: Adding a dedup check to a business transaction typically increases latency by **< 5ms** if the database is local.
- **Conflict Rate**: In a stable Kafka cluster, redelivery rate is typically **< 0.1%**. Design for the 0.1%, but optimize for the 99.9% (the "happy path").

## Real-World Case Studies

- **Stripe (Event Webhooks)**: Stripe sends webhooks for every event (e.g., `payment_intent.succeeded`). They explicitly state in their documentation that they deliver webhooks **at-least-once** and provide a unique `id` for every event. They instruct all developers to store this ID in their database and check it before processing to prevent duplicate business logic.
- **Airbnb (The 'Orpheus' Library)**: Airbnb built an internal library called **Orpheus** to handle idempotency across their SOA. Every service consumer uses Orpheus to wrap its logic. It handles the "check-then-insert" pattern into a shared database, ensuring that even if multiple instances of a service receive the same message, only one proceeds.
- **Apache Flink (Exactly-Once)**: Flink achieves "exactly-once" state updates by using **Checkpointing** and a **Two-Phase Commit** sink. It periodically snapshots its state and only "commits" the processed message offsets to Kafka once the state update is safely persisted, effectively creating an idempotent consumer at the framework level.

## Connections

- [[Idempotency]] — API-level idempotency concepts that apply equally to message consumers
- [[Outbox Pattern]] — Outbox produces at-least-once; consumers must be idempotent
- [[Saga Pattern]] — Every saga step and compensation must be idempotent
- [[Two-Phase Commit]] — Idempotent consumers are the alternative to 2PC for exactly-once semantics

## Reflection Prompts

1. Your Kafka consumer processes order events: it writes to a database and calls a third-party shipping API. The shipping API does NOT support idempotency keys. How do you prevent duplicate shipments on message redelivery?

2. You use a dedup table in Postgres. Under high throughput (10,000 messages/second), the dedup INSERT becomes a bottleneck (unique index contention). What are your options to scale this without losing dedup guarantees?

## Canonical Sources

- *Microservices Patterns* by Chris Richardson — Chapter 3 covers idempotent consumers in the context of messaging patterns
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 11: "Stream Processing" discusses exactly-once semantics and idempotency
- Kafka documentation, "Exactly Once Semantics" — Kafka's transactional consumer-producer pattern