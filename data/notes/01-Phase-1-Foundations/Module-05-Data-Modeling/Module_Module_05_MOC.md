# Module 05: Data Modeling & Schema Evolution

*The shape of your data determines the fate of your system.*

## Why This Module Matters

Storage engines determine how fast your database reads and writes. Indexes determine which queries are fast. But data modeling determines which queries are even *possible* — and how painful they are to change later. A poorly modeled schema can make simple features require complex migrations, while a well-modeled schema makes the next feature feel like it was planned from the start.

Schema evolution is the other half of the story. Your schema will change — new features, new access patterns, new requirements. The question isn't whether your schema will evolve, but whether you can evolve it without downtime, data loss, or a three-month migration project.

## Notes in This Module

### Modeling Approaches
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Data_Model_Selection]] — Relational vs document vs graph: matching the model to access patterns, not to trends
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Relational_Modeling_and_Normalization]] — Normalization forms, when to stop normalizing, and denormalization strategies

### Evolution & Migration
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Schema_Evolution]] — Backward/forward compatibility with Avro, Protobuf, and schema registries
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Zero-Downtime_Schema_Migrations]] — Expand-and-contract, ghost table migrations, and surviving migrations in production

## Prerequisites
- [[Module_Module_03_MOC]] — Storage Engines (understanding how storage engines handle schema changes)
- [[Module_Module_04_MOC]] — Databases (SQL vs NoSQL, indexing — data modeling builds on these choices)

## Where This Leads
- [[Module_Module_02_MOC]] — API Design (schema evolution parallels API versioning)
- [[Module_Module_10_MOC]] — Distributed Transactions (event sourcing and CQRS data models)
- [[Module_Module_13_MOC]] — Messaging & Pipelines (schema registries for event schemas)