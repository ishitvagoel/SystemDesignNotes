# Module 08: Consistency Models & Distributed Systems Theory

*What "correct" means when data lives on multiple machines.*

## Why This Module Matters

Every module so far has hinted at this one. Replication lag makes reads stale. Partitioning means data isn't in one place. Network failures mean nodes can't communicate. The fundamental question of distributed systems is: **when data is spread across multiple nodes, what guarantees can you provide about what a reader sees?**

Consistency models are the vocabulary for answering this question precisely. Without them, you're left with vague statements like "it's eventually consistent" without understanding what that means in practice — which invariants hold, which can be violated, and what application-level workarounds are needed.

## Notes in This Module

### Core Models
- [[Consistency Spectrum]] — Linearizability, sequential consistency, causal consistency, eventual consistency — with concrete examples of when each matters and what breaks without them

### Theorems & Frameworks
- [[CAP Theorem and PACELC]] — What CAP actually says vs how it's misused, and why PACELC is the more useful framework for real systems

### Practical Guarantees
- [[Session Guarantees]] — Read-your-writes, monotonic reads, consistent prefix — the session-level guarantees that matter in practice

## Prerequisites
- [[_Module 04 MOC]] — Database Replication (replication creates the consistency problem)
- [[_Module 07 MOC]] — Logical Clocks and Ordering (the formal tools for reasoning about event order)

## Where This Leads
- [[_Module 09 MOC]] — Consensus & Coordination (how to achieve strong consistency when you need it)
- [[_Module 10 MOC]] — Distributed Transactions (transactions across consistency boundaries)
- [[_Module 11 MOC]] — Replication & Conflict Resolution (what to do when consistency is relaxed)