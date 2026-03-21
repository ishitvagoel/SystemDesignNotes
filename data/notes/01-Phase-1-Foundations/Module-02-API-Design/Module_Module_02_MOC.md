# Module 02: API Design & Contracts

*The interface is the product — designing APIs that survive evolution.*

## Why Start Here (After Networking)

Module 1 gave you the pipes — how data moves between machines. This module is about what flows through those pipes: the contracts between services and between services and clients. A poorly designed API becomes technical debt that's nearly impossible to pay down, because every consumer has baked your mistakes into their code. Getting APIs right is one of the highest-leverage design decisions you'll make.

## Notes in This Module

### Design Principles
- [[RESTful Design Principles]] — Resource modeling, HTTP method semantics, status codes, and why HATEOAS is mostly theoretical
- [[API Versioning and Compatibility]] — URL vs header vs content negotiation versioning, backward/forward compatibility, and why "just don't break things" is easier said than done

### Resilience Patterns
- [[Rate Limiting and Throttling]] — Token bucket, sliding window, distributed rate limiting, and protecting services from their own consumers
- [[Idempotency]] — Idempotency keys, at-least-once vs exactly-once semantics, and making retries safe

### Gateway & Composition
- [[API Gateway Patterns]] — Routing, auth offload, request transformation, BFF (Backend for Frontend), and when a gateway helps vs hurts

## Prerequisites
- [[_Module 01 MOC]] — HTTP methods, status codes, REST/gRPC/GraphQL paradigms, load balancing

## Where This Leads
- [[_Module 05 MOC]] — Data Modeling & Schema Evolution (schema evolution is the data-layer equivalent of API versioning)
- [[_Module 10 MOC]] — Distributed Transactions (idempotency is critical for saga patterns and reliable messaging)
- [[_Module 12 MOC]] — Architectural Patterns (API gateways are the north-south entry point for microservice architectures)
- [[_Module 15 MOC]] — Security (OAuth2/OIDC flows, auth offloading at the gateway)