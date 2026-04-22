# Module 09: Consensus & Coordination

*Getting distributed nodes to agree — the hardest problem in computing.*

## Why This Module Matters

Module 8 defined what consistency means. This module answers: **how do you achieve it?** When you need linearizability — for leader election, distributed locks, configuration management, or replicated state machines — you need consensus. Consensus protocols are the mechanism that lets a group of unreliable nodes act as a single, reliable entity.

Raft and Paxos are the two foundational consensus algorithms. ZooKeeper, etcd, and Consul are the practical systems built on them. Understanding these gives you the ability to reason about *any* system that claims strong consistency.

## Notes in This Module

### Algorithms
- [[02-Phase-2-Distribution__Module-09-Consensus__Consensus_and_Raft]] — Raft leader election, log replication, safety proofs, and why Raft was designed to be understandable
- [[02-Phase-2-Distribution__Module-09-Consensus__Paxos_and_Its_Legacy]] — Multi-Paxos, why it's notoriously hard to implement, and its relationship to Raft

### Practical Systems
- [[02-Phase-2-Distribution__Module-09-Consensus__Coordination_Services]] — ZooKeeper, etcd, Consul — when and how to use them for leader election, configuration, and service discovery

### Coordination Primitives
- [[02-Phase-2-Distribution__Module-09-Consensus__Distributed_Locks_and_Fencing]] — Distributed locks, fencing tokens, lease-based coordination, and why naive locking is dangerous

### Impossibility
- [[02-Phase-2-Distribution__Module-09-Consensus__FLP_Impossibility]] — What it means practically that perfect consensus is impossible in asynchronous systems — and why we build consensus systems anyway

## Prerequisites
- [[Module_Module_08_MOC]] — Consistency Models (consensus is the mechanism for achieving strong consistency)
- [[Module_Module_07_MOC]] — Logical Clocks (ordering is foundational to replicated log protocols)

## Where This Leads
- [[Module_Module_10_MOC]] — Distributed Transactions (transactions across nodes use consensus or weaker coordination)
- [[Module_Module_11_MOC]] — Replication & Conflict Resolution (consensus-based replication vs conflict-resolution-based replication)
- [[Module_Module_12_MOC]] — Architectural Patterns (coordination services underpin service discovery, config management)