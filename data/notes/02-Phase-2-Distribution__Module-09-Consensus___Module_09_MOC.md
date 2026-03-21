# Module 09: Consensus & Coordination

*Getting distributed nodes to agree — the hardest problem in computing.*

## Why This Module Matters

Module 8 defined what consistency means. This module answers: **how do you achieve it?** When you need linearizability — for leader election, distributed locks, configuration management, or replicated state machines — you need consensus. Consensus protocols are the mechanism that lets a group of unreliable nodes act as a single, reliable entity.

Raft and Paxos are the two foundational consensus algorithms. ZooKeeper, etcd, and Consul are the practical systems built on them. Understanding these gives you the ability to reason about *any* system that claims strong consistency.

## Notes in This Module

### Algorithms
- [[Consensus and Raft]] — Raft leader election, log replication, safety proofs, and why Raft was designed to be understandable
- [[Paxos and Its Legacy]] — Multi-Paxos, why it's notoriously hard to implement, and its relationship to Raft

### Practical Systems
- [[Coordination Services]] — ZooKeeper, etcd, Consul — when and how to use them for leader election, configuration, and service discovery

### Coordination Primitives
- [[Distributed Locks and Fencing]] — Distributed locks, fencing tokens, lease-based coordination, and why naive locking is dangerous

### Impossibility
- [[FLP Impossibility]] — What it means practically that perfect consensus is impossible in asynchronous systems — and why we build consensus systems anyway

## Prerequisites
- [[_Module 08 MOC]] — Consistency Models (consensus is the mechanism for achieving strong consistency)
- [[_Module 07 MOC]] — Logical Clocks (ordering is foundational to replicated log protocols)

## Where This Leads
- [[_Module 10 MOC]] — Distributed Transactions (transactions across nodes use consensus or weaker coordination)
- [[_Module 11 MOC]] — Replication & Conflict Resolution (consensus-based replication vs conflict-resolution-based replication)
- [[_Module 12 MOC]] — Architectural Patterns (coordination services underpin service discovery, config management)