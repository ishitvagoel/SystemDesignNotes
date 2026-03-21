# Module 11: Replication & Conflict Resolution

*Keeping copies in sync — or deciding what to do when they disagree.*

## Why This Module Matters

Module 4 introduced replication topologies (single-leader, multi-leader, leaderless). Module 8 defined what consistency means. This module goes deep on what happens when replicas disagree — the conflict detection and resolution mechanisms that make multi-leader and leaderless replication practical. This is also where CRDTs enter the picture: data structures designed so that conflicts are impossible by construction.

## Notes in This Module

- [[Replication Deep Dive]] — Single-leader failover, split-brain, and read-after-write consistency patterns in depth
- [[Multi-Leader and Conflict Resolution]] — Conflict detection (version vectors, last-write-wins), resolution strategies, and when multi-leader is worth the complexity
- [[Leaderless Replication]] — Dynamo-style quorums, sloppy quorums, hinted handoff, anti-entropy, and Merkle trees
- [[CRDTs]] — State-based and operation-based CRDTs, practical types (G-Counter, PN-Counter, LWW-Register, OR-Set), and where they're used in production

## Prerequisites
- [[_Module 04 MOC]] — Database Replication (topologies introduced)
- [[_Module 07 MOC]] — Logical Clocks (vector clocks for conflict detection)
- [[_Module 08 MOC]] — Consistency Models (the guarantees replication provides or violates)

## Where This Leads
- [[_Module 20 MOC]] — RAG, Agentic Systems & Real-Time (CRDTs for collaborative editing)