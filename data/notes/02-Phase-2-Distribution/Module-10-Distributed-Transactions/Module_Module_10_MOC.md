# Module 10: Distributed Transactions & Reliable Messaging

*Making multi-service operations feel atomic when they fundamentally aren't.*

## Why This Module Matters

A single database gives you ACID transactions for free. The moment your operation spans two services — "debit account A, credit account B" across a payments service and a ledger service — you lose that safety net. If the debit succeeds but the credit fails (network error, service crash), you've lost money into the void.

This module covers the patterns for making multi-service operations reliable: two-phase commit (and why it's usually a bad idea), sagas (and why they're usually the right idea), the outbox pattern (for reliable event publishing), and idempotent consumers (for safe redelivery).

## Notes in This Module

- [[Two-Phase Commit]] — 2PC mechanics, failure modes, and why it's avoided in microservice architectures
- [[Saga Pattern]] — Choreography vs orchestration, compensating transactions, and designing for failure
- [[Outbox Pattern]] — Reliable event publishing without distributed transactions
- [[Idempotent Consumers]] — Deduplication strategies for message consumers in at-least-once delivery systems

## Prerequisites
- [[_Module 08 MOC]] — Consistency Models (understanding what guarantees you're giving up)
- [[_Module 09 MOC]] — Consensus (the coordination mechanisms that underpin 2PC)
- [[_Module 02 MOC]] — Idempotency fundamentals

## Where This Leads
- [[_Module 12 MOC]] — Architectural Patterns (event sourcing, CQRS, and how they relate to sagas)
- [[_Module 13 MOC]] — Message Queues & Event-Driven Architecture (the infrastructure sagas and outbox rely on)