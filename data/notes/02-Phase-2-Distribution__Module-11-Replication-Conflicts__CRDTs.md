# CRDTs

## Why This Exists

Every conflict resolution strategy we've seen so far has a flaw: LWW loses data, manual resolution requires human intervention, and application-level merge is complex and error-prone. CRDTs (Conflict-free Replicated Data Types) take a fundamentally different approach: **design the data structure so that concurrent operations always merge correctly, by mathematical construction.** Conflicts don't need resolution because they can't occur.

CRDTs achieve this by restricting operations to those that commute (order doesn't matter) and converge (any order produces the same final state). The trade-off: you're limited to data types that have this property — you can't make an arbitrary data structure conflict-free.

## Mental Model

A suggestion box. Multiple people put suggestions in the box simultaneously. Nobody needs to coordinate, and no suggestions are lost — the final state is simply the union of all suggestions. The "merge" is just combining everything together. This is a Set CRDT (specifically, a Grow-Only Set / G-Set).

Now imagine a vote counter. Multiple counting stations count votes independently. To get the total, you take the maximum count from each station (not the sum — that would double-count). This is a G-Counter.

The pattern: choose operations where merging is commutative (`merge(A, B) = merge(B, A)`) and idempotent (`merge(A, A) = A`). Then replicas can merge in any order, any number of times, and always converge to the same result.

## Two Flavors

### State-Based CRDTs (CvRDTs — Convergent)

Each replica maintains the full state. Replicas periodically send their entire state to other replicas. The merge function combines two states:

```
merge(state_A, state_B) → merged_state
```

The merge function must be:
- **Commutative**: `merge(A, B) = merge(B, A)`
- **Associative**: `merge(A, merge(B, C)) = merge(merge(A, B), C)`
- **Idempotent**: `merge(A, A) = A`

These properties (a join-semilattice) guarantee convergence regardless of merge order or duplicate merges.

**Pros**: Simple communication model (just send state). Tolerates message loss and duplication.
**Cons**: Sending full state is expensive for large data structures.

### Operation-Based CRDTs (CmRDTs — Commutative)

Instead of sending state, replicas broadcast each operation. Every replica applies operations to its local state.

Operations must be **commutative**: applying operation A then B produces the same result as B then A. The delivery layer must guarantee **exactly-once, causal-order delivery** (each operation is delivered exactly once, and causally dependent operations arrive in order).

**Pros**: Smaller messages (just the operation, not the full state).
**Cons**: Requires reliable, exactly-once, causally-ordered delivery — a stronger requirement on the communication layer.

## Practical CRDT Types

### G-Counter (Grow-Only Counter)

Each replica maintains its own counter. The global count is the sum across all replicas.

```
Replica A: {A: 5, B: 0, C: 0}  → total = 5
Replica B: {A: 0, B: 3, C: 0}  → total = 3
Replica C: {A: 0, B: 0, C: 7}  → total = 7

Merge: {A: max(5,0,0)=5, B: max(0,3,0)=3, C: max(0,0,7)=7} → total = 15
```

**Merge**: For each replica's entry, take the max. The sum of maxes equals the true global count.

**Use case**: Page view counters, "likes" counts, any monotonically increasing counter.

### PN-Counter (Positive-Negative Counter)

Two G-Counters: one for increments (P), one for decrements (N). The value is P - N.

```
Value = sum(P) - sum(N)
```

**Use case**: Any counter that can go up and down — inventory counts, vote counts (upvote/downvote), connection counts.

### LWW-Register (Last-Writer-Wins Register)

A register (single value) where the write with the latest timestamp wins. Each write is tagged with a timestamp; merge picks the one with the highest timestamp.

```
Merge: if timestamp_A > timestamp_B → value_A, else → value_B
```

This is conflict-free because the merge function is deterministic. But it has the same data loss property as LWW in multi-leader replication — one concurrent write is silently discarded.

**Use case**: User profile fields where "latest update wins" is acceptable. Not suitable for data where both concurrent values carry meaning.

### OR-Set (Observed-Remove Set)

A set where elements can be added and removed. The key challenge: if one replica adds element X while another removes X concurrently, what's the result?

**OR-Set semantics**: Add wins. If a concurrent add and remove happen, the element is present after merge. The removal only applies to the specific "add" instances it observed — if a new add arrives that wasn't observed, the element reappears.

**Implementation**: Each add creates a unique tag (UUID). Remove deletes specific tags, not the element itself. On merge, an element is present if any of its tags are present.

**Use case**: Shopping carts (add/remove items concurrently), shared lists, collaborative tool selections.

### JSON CRDTs

Extending CRDTs to JSON documents: each field is independently a CRDT (counter, register, set, map). Concurrent edits to different fields merge cleanly. Concurrent edits to the same field use the field's CRDT type for resolution.

**Automerge** and **Yjs** are libraries that implement JSON CRDTs for collaborative editing. They're the foundation for real-time collaborative features similar to Google Docs.

## CRDTs in Production

**Redis CRDTs** (Redis Enterprise): Redis Enterprise supports CRDT-based data types for active-active geo-distribution. Counters, sets, and strings use CRDT merge semantics across data centers.

**Riak**: One of the earliest databases to support CRDTs natively (counters, sets, maps, registers).

**Figma**: Uses CRDTs for their real-time collaborative design tool. Multiple users editing the same design concurrently — edits merge without conflicts. See [[Real-Time Collaboration]].

**Apple Notes, Notion**: Use CRDT-inspired approaches for offline editing and sync.

## Trade-Off Analysis

| CRDT Type | Data Loss? | Complexity | Storage Overhead | Best For |
|-----------|-----------|------------|------------------|----------|
| G-Counter | No | Low | O(N replicas) | Monotonic counters |
| PN-Counter | No | Low | O(N replicas) × 2 | Bidirectional counters |
| LWW-Register | Yes (lossy) | Lowest | O(1) | Last-update-wins fields |
| OR-Set | No | Medium | O(elements × adds) | Add/remove sets |
| JSON CRDT | Field-dependent | High | High (per-field metadata) | Collaborative documents |

## Limitations

- **Not all data types have CRDT representations**: Anything that requires global invariants (e.g., "balance must not go below zero") can't be a CRDT — enforcing the invariant requires coordination, which CRDTs eliminate by design.
- **Metadata overhead**: CRDTs carry per-replica metadata (counters, version vectors, tombstones). For fine-grained CRDTs (character-level text editing), this metadata can exceed the data itself.
- **Tombstone accumulation**: Deleted elements often become tombstones (markers that the element was removed). Without garbage collection, tombstones grow unboundedly. GC requires coordination (agree that all replicas have seen the deletion) — reintroducing the coordination CRDTs were designed to avoid.

## Failure Modes

**Tombstone accumulation in OR-Sets**: Removing an element from an Observed-Remove Set requires a tombstone (to distinguish "never added" from "added then removed"). Tombstones accumulate forever — they can never be safely garbage-collected without global coordination. A set with millions of add/remove cycles becomes bloated with metadata. Solution: periodic garbage collection with a causal stability threshold (once all replicas have seen the tombstone, it can be pruned), or use a different CRDT (Add-Wins Set where possible).

**Counter overflow in G-Counters**: A G-Counter (grow-only) uses per-node counters that only increment. In high-throughput counting scenarios, individual node counters can grow very large. The merged counter value is the sum across all nodes — if a node is replaced (new node ID), the old node's count is still in the state, inflating the total. Solution: garbage-collect entries for decommissioned nodes, use bounded counters, or use PN-Counters with periodic reset-and-snapshot.

**CRDT merge producing unexpected results**: Concurrent list insertions at the same position may interleave characters in an order that neither user intended. Two users both type "hello" at the same cursor position — the merge might produce "hheelllloo" or another interleaving. Solution: use position-based CRDTs (RGA, LSEQ) that produce deterministic interleaving, accept that concurrent same-position edits produce imperfect but convergent results, and rely on user awareness of concurrent editing.

**Large CRDT state on sync**: A CRDT that hasn't synced in a long time accumulates a large delta. Syncing the full state or a large delta over the network causes bandwidth spikes and delays. Mobile clients with limited connectivity are especially affected. Solution: delta-state CRDTs (send only changes since last sync), compression, and periodic full-state compaction.

**Semantic conflict in application logic**: CRDTs guarantee convergence — all replicas reach the same state — but not semantic correctness. Two users concurrently set a meeting time to 2 PM and 3 PM respectively. LWW-Register converges to one value, but neither user knows their choice was overridden. Solution: CRDTs handle syntactic convergence; application-level conflict resolution (notification to users, manual merge UI) is still needed for semantic conflicts.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Replica A (New York)"
        StateA[State: {A:5, B:2}]
        OpA[Increment A] --> StateA
    end

    subgraph "Replica B (London)"
        StateB[State: {A:4, B:3}]
        OpB[Increment B] --> StateB
    end

    StateA -- "Gossip: {A:5, B:2}" --> MergeB
    StateB -- "Gossip: {A:4, B:3}" --> MergeA

    subgraph "Merge Logic (Join Semi-Lattice)"
        MergeA["Merge: max(A), max(B)"] --> FinalA[Final: {A:5, B:3}]
        MergeB["Merge: max(A), max(B)"] --> FinalB[Final: {A:5, B:3}]
    end

    Note over FinalA, FinalB: Both converge to 8 without a leader
```

## Back-of-the-Envelope Heuristics

- **Metadata Overhead**: For a simple text editor, CRDT metadata (IDs, tombstones) can be **2x-10x larger** than the actual text content.
- **Merge Complexity**: Most state-based CRDT merges are **O(N)** where N is the number of replicas or elements.
- **Network Traffic**: Operation-based CRDTs send small deltas (bytes), whereas State-based CRDTs send the full object (KB/MB) unless using **Delta-CRDTs**.
- **Conflict Rate**: CRDTs are ideal when concurrent writes are frequent (**> 1% of operations**). If conflicts are rare, simpler LWW (Last Writer Wins) is usually more efficient.

## Real-World Case Studies

- **Figma (Design Multi-player)**: Figma famously uses a specialized CRDT for its collaborative design tool. They found that standard CRDTs were too memory-intensive for complex vector graphics, so they built a hybrid system that treats the design tree as a CRDT, allowing thousands of concurrent edits to merge smoothly without ever showing a "Conflict" dialog.
- **Apple Notes (Sync)**: Apple Notes uses a CRDT-based approach to sync notes across iPhone, iPad, and Mac. This allows you to edit a note offline on your phone and have it merge cleanly with changes made on your Mac, even if you edited the same paragraph.
- **Redis (Active-Active)**: Redis Enterprise offers **CRDT-based Conflict-free Replicated Data Types**. This allows a developer to have a Redis instance in US-East and another in EU-West, both accepting writes to the same Set or Counter. Redis handles the background merging using CRDT math, ensuring both regions eventually see the same total.

## Connections

- [[Multi-Leader and Conflict Resolution]] — CRDTs are the conflict-free alternative to LWW and manual resolution
- [[Leaderless Replication]] — CRDTs work naturally with leaderless replication (every node merges independently)
- [[Logical Clocks and Ordering]] — Vector clocks and causal ordering underpin operation-based CRDTs
- [[Real-Time Collaboration]] — CRDTs vs OT (Operational Transform) for real-time collaboration
- [[Consistency Spectrum]] — CRDTs provide strong eventual consistency: replicas that have received the same set of operations converge to the same state

## Reflection Prompts

1. Your e-commerce platform tracks inventory counts across 3 data centers. A PN-Counter CRDT tracks the count. In DC-A, someone buys the last item (decrement). In DC-B, a warehouse worker adds 5 items (increment). Before replication, DC-A shows 0 (sold out), DC-B shows 6. After merge, the count is 5. Is this correct? What invariant can't you enforce with a CRDT counter?

2. You're building a shared to-do list using an OR-Set CRDT. Alice adds "Buy milk." Bob removes "Buy milk." Charlie adds "Buy milk" again, unaware of Bob's removal. After all operations merge, is "Buy milk" on the list? Trace through the OR-Set semantics to explain why.

## Canonical Sources

- Shapiro et al., "A Comprehensive Study of Convergent and Commutative Replicated Data Types" (2011) — the foundational CRDT survey paper
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 5 introduces CRDTs in the context of conflict resolution
- Kleppmann & Martin, "Automerge: Real-time data sync between edge devices" — the Automerge JSON CRDT library
- Figma Engineering Blog, "How Figma's multiplayer technology works" — CRDT-based real-time collaboration at scale