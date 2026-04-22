# Message Queues vs Event Streams

## Why This Exists

"Should we use Kafka or RabbitMQ?" is asked constantly, but it's the wrong framing. They solve fundamentally different problems. RabbitMQ is a **message broker** — it routes messages from producers to consumers and ensures each message is processed exactly once. Kafka is an **event log** — it durably stores an ordered sequence of events that multiple consumers can independently read.

The distinction matters: a message queue is about *task distribution*. An event stream is about *event history*.


## Mental Model

A post office vs. a newspaper. A **message queue** (RabbitMQ, SQS) is like a post office: a letter is addressed to one recipient, and once delivered, it's gone from the post office. If ten people need the same information, you send ten letters. A queue distributes work — each message is processed by exactly one consumer. An **event stream** (Kafka, Redpanda) is like a newspaper: the publisher prints the day's events, and anyone can subscribe. Every subscriber gets every event, and past issues are kept in the archive so a new subscriber can read from the beginning. A stream records history — each event can be consumed by many consumers independently.

## Message Queues (RabbitMQ, SQS, ActiveMQ)

**Model**: Producer → Queue → Consumer. A message is delivered to one consumer (competing consumers pattern). Once acknowledged, the message is removed from the queue.

**Semantics**: Each message is processed by exactly one consumer (work distribution). The queue doesn't retain messages after consumption. There's no concept of "replaying" old messages.

**Best for**: Task distribution (process this order, send this email, resize this image), work queues with backpressure, point-to-point communication, and request-reply patterns.

**Features**: Message routing (RabbitMQ exchanges — direct, topic, fanout, headers), priority queues, dead letter queues (DLQ) for failed messages, message TTL, delayed messages.

## Event Streams (Kafka, Redpanda, Pulsar)

**Model**: Producer → Topic (partitioned log) → Consumer Groups. Events are appended to an ordered, immutable log. Multiple consumer groups can read the same log independently, each tracking their own position (offset).

**Semantics**: Events are retained (configurable retention: days, weeks, forever). Multiple consumers read the same events — it's a broadcast, not a queue. Consumers can "rewind" and re-read old events.

**Best for**: Event-driven architecture (react to business events), event sourcing (the log IS the source of truth), stream processing (real-time analytics, aggregations), data integration (CDC from databases to analytics), and audit logging.

**Key property — the log**: Kafka's core abstraction is an append-only, ordered, partitioned log. This is the same abstraction as the [[01-Phase-1-Foundations__Module-03-Storage-Engines__Write-Ahead_Log]] in databases and the event log in [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Event_Sourcing_and_CQRS]]. Jay Kreps' "The Log" essay argues this is the unifying abstraction for data integration.

## Comparison

| Dimension | Message Queue (RabbitMQ) | Event Stream (Kafka) |
|-----------|------------------------|---------------------|
| Delivery | One consumer per message | Multiple consumer groups per event |
| Retention | Deleted after ACK | Retained (configurable duration) |
| Replay | No | Yes (consumer resets offset) |
| Ordering | Per-queue FIFO | Per-partition FIFO |
| Throughput | Moderate (10K–100K msg/sec) | Very high (millions msg/sec) |
| Latency | Low (sub-ms possible) | Low (sub-10ms typical) |
| Message routing | Rich (exchanges, bindings) | Topic + partition only |
| Back-pressure | Consumer controls prefetch | Consumer controls read rate |
| Best for | Task distribution, work queues | Event-driven architecture, data pipelines |

## Dead Letter Queues and Poison Messages

When a message can't be processed (invalid format, unrecoverable error), it becomes a **poison message** — retried forever, blocking the queue. A **dead letter queue (DLQ)** captures these failed messages after N retries, removing them from the main queue so processing can continue.

DLQ design: monitor the DLQ size (growing = something is wrong), include original error metadata, and build tooling to inspect, fix, and replay DLQ messages.

## Back-Pressure

When consumers can't keep up with producers:

- **RabbitMQ**: Apply prefetch limits (consumers request N messages at a time). If all consumers are at their prefetch limit, the queue grows. RabbitMQ can apply flow control to slow producers.
- **Kafka**: Consumer controls its read rate. If a consumer falls behind, events accumulate in the topic (which is designed for this — Kafka is a durable log). The consumer catches up when it has capacity. No producer slowdown needed.

## Trade-Off Analysis

| System Type | Message Lifecycle | Consumer Model | Ordering | Replay | Best For |
|------------|------------------|---------------|---------|--------|----------|
| Message queue (RabbitMQ, SQS) | Consumed = deleted | Competing consumers — each message processed once | Per-queue (RabbitMQ) or best-effort (SQS) | No — consumed messages are gone | Work distribution, task queues, job processing |
| Event stream (Kafka, Kinesis) | Retained for configured period | Consumer groups — each group gets all messages | Per-partition ordering | Yes — replay from any offset | Event sourcing, CDC, audit, multi-consumer fanout |
| Redis Streams | Retained until trimmed | Consumer groups (Kafka-like) | Per-stream | Yes — within retention | Lightweight streaming, low-infra-overhead |
| Pulsar | Configurable — queue or stream semantics | Both — exclusive or shared subscriptions | Per-partition or per-key | Yes — tiered storage | When you need both queue and stream semantics |

**Choose by consumer pattern, not by popularity**: If each message should be processed exactly once by one worker (a job queue), use a message queue. If multiple independent systems need to react to the same event (fanout), or you need replay capability, use an event stream. Kafka is not a message queue — using it as one (single consumer, delete after processing) works but wastes Kafka's strengths.

## Failure Modes

**Queue message loss under broker failure**: A message is dequeued by a consumer, the consumer starts processing, and the broker crashes before the consumer acknowledges completion. The message is lost — it was dequeued (removed from the queue) but never processed. Solution: use acknowledgment-based delivery (consumer explicitly ACKs after processing), persistent message storage, and publisher confirms.

**Kafka consumer rebalance causing duplicates**: A Kafka consumer group rebalances (member joins/leaves). Partitions are reassigned. A consumer had processed messages but not committed offsets. The new consumer for that partition reprocesses those messages. Solution: commit offsets frequently (after each batch), use idempotent consumers, or enable Kafka's exactly-once semantics (transactional consumers).

**SQS message visibility timeout mismatch**: A consumer takes longer to process a message than the visibility timeout. SQS makes the message visible again. Another consumer picks it up and processes it concurrently. The message is processed twice. Solution: set visibility timeout longer than the maximum processing time, extend visibility timeout during long operations (using `ChangeMessageVisibility`), and design consumers to be idempotent.

**Event stream retention expiration**: A new consumer starts reading a Kafka topic from the beginning to build initial state. But the retention period has expired for old events — the consumer can't rebuild complete state. It starts with partial data and produces incorrect results. Solution: use compacted topics for state (retains latest value per key forever), set retention periods based on consumer rebuild needs, or maintain snapshots for new consumer bootstrapping.

**Queue depth growth masking upstream issues**: A queue absorbs traffic spikes, hiding the fact that a downstream service is degraded. The queue depth grows to millions. When the downstream recovers, it's overwhelmed by the backlog. Solution: monitor queue depth and age as first-class metrics, alert on depth thresholds, and implement back-pressure (reject new messages when the queue is too deep) rather than unbounded buffering.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Message Queue (Task Distribution)"
        P1[Producer] --> Q[Queue: RabbitMQ/SQS]
        Q --> C1[Consumer A]
        Q --> C2[Consumer B]
    end

    subgraph "Event Stream (Log/History)"
        P2[Producer] --> L[Log: Kafka/Redpanda]
        subgraph "Consumer Group 1"
            L --> G1_C1[Service A.1]
        end
        subgraph "Consumer Group 2"
            L --> G2_C1[Service B.1]
        end
    end

    style Q fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style L fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Throughput**: Kafka can handle **millions of events/sec** per cluster. RabbitMQ typically caps out at **tens of thousands/sec** due to the overhead of complex routing and per-message ACKs.
- **Retention**: Queues are for **now** (transient). Streams are for **history** (configurable retention from hours to years).
- **Fan-out Cost**: In a queue, sending one event to 10 consumers requires **10x storage** (10 messages). In a stream, it's **1x storage** (1 message read by 10 pointers).
- **Latency**: RabbitMQ provides lower "end-to-end" latency (**< 1ms**) for simple task passing. Kafka has higher overhead due to batching and disk fsyncs (**5ms - 50ms**).

## Real-World Case Studies

- **Uber (Kafka for Everything)**: Uber uses Kafka as the backbone of their data infrastructure, processing **trillions of messages** per day. They use it for everything from real-time driver locations to financial auditing. Because Kafka is an immutable log, they can "replay" events to debug what happened during a specific trip days after it occurred.
- **Instagram (RabbitMQ for Tasks)**: Instagram uses RabbitMQ to manage background tasks like photo resizing and notification delivery. For these use cases, they don't need a history of every photo ever resized—they just need to ensure that *someone* resizes the photo once and deletes the task from the queue.
- **LinkedIn (The Origins of Kafka)**: LinkedIn created Kafka because they needed a way to ingest massive amounts of "tracking" data (clicks, page views) and make it available to both real-time dashboards and offline Hadoop jobs. Traditional message queues failed because they couldn't handle the volume or the multiple independent readers.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Event-Driven_Architecture_Patterns]] — Message queues and event streams are the transport for different EDA patterns
- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Stream_Processing]] — Kafka is the standard input for stream processing engines
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Outbox_Pattern]] — Events published via outbox are typically sent to Kafka
- [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Idempotent_Consumers]] — Both queues and streams deliver at-least-once; consumers must be idempotent

## Reflection Prompts

1. Your system uses RabbitMQ for task distribution (competing consumers) and Kafka for event streaming (multi-consumer fanout). A new feature requires both: a task needs to be processed exactly once AND three different services need to react to the same event. Could you use just Kafka for both? What would you gain and lose compared to using both systems?

2. An SQS queue has a backlog of 2 million messages. The consumer processes 100 messages/second. It will take 5.5 hours to drain the queue. Business says this must be under 30 minutes. You can't change the processing logic (each message takes ~10ms). What's your strategy, and how do you prevent message ordering issues when parallelizing?

3. Your team is debating whether to use Kafka or a message queue for an order processing pipeline. Orders must be processed in sequence per customer (customer A's orders in order, but A and B can be parallel). How does this ordering requirement affect your choice, and how would you implement it in each system?

## Canonical Sources

- Jay Kreps, "The Log: What every software engineer should know about real-time data's unifying abstraction" (2013) — the essay that reframes Kafka as a fundamental data infrastructure primitive
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 11: "Stream Processing" covers message brokers vs event logs
- *Microservices Patterns* by Chris Richardson — Chapter 3: "Interprocess Communication" covers messaging patterns