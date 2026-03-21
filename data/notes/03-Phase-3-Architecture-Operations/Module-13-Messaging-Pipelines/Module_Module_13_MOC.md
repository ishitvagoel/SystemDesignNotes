# Module 13: Message Queues, Event Streaming & Data Pipelines

*How data moves between services — from point-to-point messages to planet-scale event streams.*

## Why This Module Matters

In a monolith, components call each other directly. In a distributed system, you need an intermediary — something that decouples producers from consumers, buffers traffic spikes, and ensures messages aren't lost when a consumer is down. This module covers the three layers of asynchronous data movement: message queues for task distribution, event streams for durable event logs, and data pipelines for batch and stream analytics.

Understanding the difference between a message queue and an event stream is one of the most consequential architectural decisions you'll make. It determines whether you can replay events, how you scale consumers, and whether your system can support event sourcing and CQRS patterns.

## Notes in This Module

### Messaging Primitives
- [[Message Queues vs Event Streams]] — The fundamental distinction: queues deliver messages to one consumer (competing consumers pattern); streams store events durably for many consumers. RabbitMQ vs Kafka, SQS vs Kinesis.
- [[Change Data Capture]] — Turning database changes into event streams without application changes. Debezium, WAL tailing, the outbox pattern bridge.

### Architecture Patterns
- [[Event-Driven Architecture Patterns]] — Event notification, event-carried state transfer, and event sourcing. When to use each, and the coupling trade-offs.
- [[Stream Processing]] — Windowing, watermarks, exactly-once semantics, and the engines that make it work (Flink, Kafka Streams).

### Data Infrastructure
- [[Batch Processing and Data Pipelines]] — Lambda vs Kappa, lakehouses, ETL vs ELT, data contracts for cross-team reliability.

## Prerequisites
- [[_Module 02 MOC]] — API contracts (synchronous before asynchronous)
- [[_Module 10 MOC]] — Distributed transactions (sagas and outbox patterns use messaging)
- [[_Module 03 MOC]] — Write-ahead logs (Kafka's storage model is essentially a distributed WAL)

## Where This Leads
- [[_Module 12 MOC]] — Event sourcing and CQRS (architectural patterns that build on event streams)
- [[_Module 14 MOC]] — Search systems (often fed by CDC or event streams)
- [[_Module 20 MOC]] — Real-time collaboration and data pipelines for AI/RAG
