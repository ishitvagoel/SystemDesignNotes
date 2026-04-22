# Module 02: API Design & Contracts

*The interface is the product — designing APIs that survive evolution.*

## Why Start Here (After Networking)

Module 1 gave you the pipes — how data moves between machines. This module is about what flows through those pipes: the contracts between services and between services and clients. A poorly designed API becomes technical debt that's nearly impossible to pay down, because every consumer has baked your mistakes into their code. Getting APIs right is one of the highest-leverage design decisions you'll make.

## Notes in This Module

### Design Principles
- [[01-Phase-1-Foundations__Module-02-API-Design__RESTful_Design_Principles]] — Resource modeling, HTTP method semantics, status codes, and why HATEOAS is mostly theoretical
- [[01-Phase-1-Foundations__Module-02-API-Design__API_Versioning_and_Compatibility]] — URL vs header vs content negotiation versioning, backward/forward compatibility, and why "just don't break things" is easier said than done

### Resilience Patterns
- [[01-Phase-1-Foundations__Module-02-API-Design__Rate_Limiting_and_Throttling]] — Token bucket, sliding window, distributed rate limiting, and protecting services from their own consumers
- [[01-Phase-1-Foundations__Module-02-API-Design__Idempotency]] — Idempotency keys, at-least-once vs exactly-once semantics, and making retries safe

### Gateway & Composition
- [[01-Phase-1-Foundations__Module-02-API-Design__API_Gateway_Patterns]] — Routing, auth offload, request transformation, BFF (Backend for Frontend), and when a gateway helps vs hurts

## Prerequisites
- [[Module_Module_01_MOC]] — HTTP methods, status codes, REST/gRPC/GraphQL paradigms, load balancing

## Where This Leads
- [[Module_Module_05_MOC]] — Data Modeling & Schema Evolution (schema evolution is the data-layer equivalent of API versioning)
- [[Module_Module_10_MOC]] — Distributed Transactions (idempotency is critical for saga patterns and reliable messaging)
- [[Module_Module_12_MOC]] — Architectural Patterns (API gateways are the north-south entry point for microservice architectures)
- [[Module_Module_15_MOC]] — Security (OAuth2/OIDC flows, auth offloading at the gateway)