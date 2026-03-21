# Module 05: Data Modeling & Schema Evolution

*The shape of your data determines the fate of your system.*

## Why This Module Matters

Storage engines determine how fast your database reads and writes. Indexes determine which queries are fast. But data modeling determines which queries are even *possible* — and how painful they are to change later. A poorly modeled schema can make simple features require complex migrations, while a well-modeled schema makes the next feature feel like it was planned from the start.

Schema evolution is the other half of the story. Your schema will change — new features, new access patterns, new requirements. The question isn't whether your schema will evolve, but whether you can evolve it without downtime, data loss, or a three-month migration project.

## Notes in This Module

### Modeling Approaches
- [[Data Model Selection]] — Relational vs document vs graph: matching the model to access patterns, not to trends
- [[Relational Modeling and Normalization]] — Normalization forms, when to stop normalizing, and denormalization strategies

### Evolution & Migration
- [[Schema Evolution]] — Backward/forward compatibility with Avro, Protobuf, and schema registries
- [[Zero-Downtime Schema Migrations]] — Expand-and-contract, ghost table migrations, and surviving migrations in production

## Prerequisites
- [[_Module 03 MOC]] — Storage Engines (understanding how storage engines handle schema changes)
- [[_Module 04 MOC]] — Databases (SQL vs NoSQL, indexing — data modeling builds on these choices)

## Where This Leads
- [[_Module 02 MOC]] — API Design (schema evolution parallels API versioning)
- [[_Module 10 MOC]] — Distributed Transactions (event sourcing and CQRS data models)
- [[_Module 13 MOC]] — Messaging & Pipelines (schema registries for event schemas)