# Module 11: Replication & Conflict Resolution

*Keeping copies in sync — or deciding what to do when they disagree.*

## Why This Module Matters

Module 4 introduced replication topologies (single-leader, multi-leader, leaderless). Module 8 defined what consistency means. This module goes deep on what happens when replicas disagree — the conflict detection and resolution mechanisms that make multi-leader and leaderless replication practical. This is also where CRDTs enter the picture: data structures designed so that conflicts are impossible by construction.

## Notes in This Module

- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Replication_Deep_Dive]] — Single-leader failover, split-brain, and read-after-write consistency patterns in depth
- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Multi-Leader_and_Conflict_Resolution]] — Conflict detection (version vectors, last-write-wins), resolution strategies, and when multi-leader is worth the complexity
- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__Leaderless_Replication]] — Dynamo-style quorums, sloppy quorums, hinted handoff, anti-entropy, and Merkle trees
- [[02-Phase-2-Distribution__Module-11-Replication-Conflicts__CRDTs]] — State-based and operation-based CRDTs, practical types (G-Counter, PN-Counter, LWW-Register, OR-Set), and where they're used in production

## Prerequisites
- [[Module_Module_04_MOC]] — Database Replication (topologies introduced)
- [[Module_Module_07_MOC]] — Logical Clocks (vector clocks for conflict detection)
- [[Module_Module_08_MOC]] — Consistency Models (the guarantees replication provides or violates)

## Where This Leads
- [[Module_Module_20_MOC]] — RAG, Agentic Systems & Real-Time (CRDTs for collaborative editing)