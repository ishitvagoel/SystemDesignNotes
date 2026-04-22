# Module 08: Consistency Models & Distributed Systems Theory

*What "correct" means when data lives on multiple machines.*

## Why This Module Matters

Every module so far has hinted at this one. Replication lag makes reads stale. Partitioning means data isn't in one place. Network failures mean nodes can't communicate. The fundamental question of distributed systems is: **when data is spread across multiple nodes, what guarantees can you provide about what a reader sees?**

Consistency models are the vocabulary for answering this question precisely. Without them, you're left with vague statements like "it's eventually consistent" without understanding what that means in practice — which invariants hold, which can be violated, and what application-level workarounds are needed.

## Notes in This Module

### Core Models
- [[02-Phase-2-Distribution__Module-08-Consistency-Models__Consistency_Spectrum]] — Linearizability, sequential consistency, causal consistency, eventual consistency — with concrete examples of when each matters and what breaks without them

### Theorems & Frameworks
- [[02-Phase-2-Distribution__Module-08-Consistency-Models__CAP_Theorem_and_PACELC]] — What CAP actually says vs how it's misused, and why PACELC is the more useful framework for real systems

### Practical Guarantees
- [[02-Phase-2-Distribution__Module-08-Consistency-Models__Session_Guarantees]] — Read-your-writes, monotonic reads, consistent prefix — the session-level guarantees that matter in practice

## Prerequisites
- [[Module_Module_04_MOC]] — Database Replication (replication creates the consistency problem)
- [[Module_Module_07_MOC]] — Logical Clocks and Ordering (the formal tools for reasoning about event order)

## Where This Leads
- [[Module_Module_09_MOC]] — Consensus & Coordination (how to achieve strong consistency when you need it)
- [[Module_Module_10_MOC]] — Distributed Transactions (transactions across consistency boundaries)
- [[Module_Module_11_MOC]] — Replication & Conflict Resolution (what to do when consistency is relaxed)