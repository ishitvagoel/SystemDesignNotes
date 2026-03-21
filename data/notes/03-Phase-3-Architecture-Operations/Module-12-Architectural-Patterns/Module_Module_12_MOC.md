# Module 12: Architectural Patterns & Service Decomposition

*The high-stakes structural decisions that shape everything downstream.*

## Notes in This Module

- [[Monolith vs Microservices]] — The decision framework, not a foregone conclusion
- [[Service Decomposition and Bounded Contexts]] — DDD, Conway's Law, and team topology alignment
- [[Event Sourcing and CQRS]] — Append-only event logs, projections, and when command-query separation justifies the complexity
- [[Cell-Based Architecture]] — Blast radius isolation, cell routing, independent scaling
- [[Strangler Fig and Migration Patterns]] — Incremental migration from monolith to services, sidecar pattern, service mesh

## Prerequisites
- [[_Module 10 MOC]] — Distributed Transactions (sagas, event sourcing connections)
- [[_Module 02 MOC]] — API Design (gateway patterns, service interfaces)

## Where This Leads
- [[_Module 13 MOC]] — Message Queues & Event-Driven Architecture
- [[_Module 16 MOC]] — Reliability Engineering & Testing
- [[_Module 17 MOC]] — Observability, Deployment & Release Engineering