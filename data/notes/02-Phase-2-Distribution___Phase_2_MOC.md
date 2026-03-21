# Phase 2: Distribution & Coordination

*What happens when data lives on more than one machine.*

This is the theoretical core of the vault. Consistency models define what "correct" means. Consensus protocols achieve it. Distributed transactions span it. Replication and conflict resolution cope when you can't (or choose not to) achieve it.

## Modules

| Module | Focus | Key Question Answered |
|--------|-------|----------------------|
| [[_Module 08 MOC]] | Consistency Models & Theory | What guarantees can you provide about what a reader sees? |
| [[_Module 09 MOC]] | Consensus & Coordination | How do multiple nodes agree on a single value? |
| [[_Module 10 MOC]] | Distributed Transactions | How do you make multi-service operations reliable? |
| [[_Module 11 MOC]] | Replication & Conflict Resolution | What do you do when replicas disagree? |

## After This Phase

You'll be able to reason precisely about consistency, consensus, and conflict — the three C's that determine whether a distributed system is correct or just coincidentally functional.