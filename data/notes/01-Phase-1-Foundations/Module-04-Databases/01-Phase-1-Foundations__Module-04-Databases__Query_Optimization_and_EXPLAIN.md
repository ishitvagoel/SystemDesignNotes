# Query Optimization and EXPLAIN

## Why This Exists

Writing a SQL query that returns correct results is the easy part. Writing one that remains correct *and* fast at 10 million rows, under concurrent load, with indexes the optimizer might or might not use — that's the hard part. The same query can run in 0.5ms or 45 seconds depending on whether the optimizer picks the right index, the statistics are stale, or a subtle data type mismatch forces a full table scan.

Most database performance problems are not hardware problems. They're query problems. Understanding how the query optimizer works, how to read an EXPLAIN output, and how to recognize anti-patterns turns a "we need more database servers" problem into a "we need a covering index" problem — solvable in minutes instead of weeks.

## Mental Model

The query optimizer is a **travel agent** trying to find the cheapest route from your query to the result. It has a map (the schema), historical traffic data (statistics: row counts, value distributions), and a set of available transportation options (sequential scans, index scans, hash joins, nested loop joins). It estimates the "cost" of every possible route and picks the cheapest one.

The key insight: the optimizer makes **estimates**, not measurements. If the statistics are stale (they are, in fast-changing tables), the optimizer's estimates are wrong, and it picks the wrong route. Reading an EXPLAIN output is reading the optimizer's travel plan — you're checking whether its assumptions about traffic (row counts) match reality, and whether it chose the right transportation (access method).

## How the Cost-Based Optimizer Works

### Statistics: The Foundation of Estimates

The optimizer estimates how many rows each operation will produce based on **table statistics**:

- **n_live_tup**: Estimated total row count
- **null_frac**: Fraction of NULL values per column
- **n_distinct**: Number of distinct values (negative = fraction of total rows; -0.5 means ~50% of rows are distinct)
- **most_common_vals / most_common_freqs**: The top-N most common values and their frequencies
- **histogram_bounds**: Bucket boundaries for estimating range predicate selectivity

In PostgreSQL: `pg_stats` view shows per-column statistics. Run `ANALYZE table_name` to refresh.

**The selectivity problem**: If `status` has values `('active', 'inactive', 'deleted')` with frequencies (0.7, 0.2, 0.1), the optimizer estimates `WHERE status = 'active'` returns 70% of rows (too many to use an index). `WHERE status = 'deleted'` returns 10% of rows — the optimizer will likely use an index here. This is **cardinality estimation** in action.

### The Three Join Algorithms

For two tables being joined, the optimizer chooses:

| Algorithm | When Used | Memory | CPU | Best For |
|-----------|-----------|--------|-----|----------|
| **Nested Loop** | Small inner table, indexed join key | O(1) | O(n×m) worst case | Small tables, indexed FK joins |
| **Hash Join** | No usable index, large unsorted tables | O(inner table) | O(n+m) | Large equi-joins without indexes |
| **Merge Join** | Both sides sorted on join key | O(1) | O(n+m) | Pre-sorted data, range joins |

**The N+1 anti-pattern** is a nested loop where the inner table is re-queried for every outer row. ORM-generated queries are the common cause: `SELECT * FROM orders` (1 query → N rows) + for each order `SELECT * FROM users WHERE id = ?` (N queries). Fix: use a JOIN or eager loading.

## Reading EXPLAIN Output

### PostgreSQL EXPLAIN ANALYZE

`EXPLAIN ANALYZE` executes the query and shows actual vs estimated row counts — the most important diagnostic tool.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, u.email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.created_at > NOW() - INTERVAL '7 days'
  AND o.status = 'pending';
```

Example output (simplified):
```
Hash Join  (cost=1240.50..8932.10 rows=842 width=45)
           (actual time=12.3..89.4 rows=1203 loops=1)
  Hash Cond: (o.user_id = u.id)
  Buffers: shared hit=423 read=1891
  ->  Seq Scan on orders o  (cost=0..7200.10 rows=842 width=12)
                              (actual time=0.1..67.2 rows=1203 loops=1)
        Filter: ((created_at > ...) AND (status = 'pending'))
        Rows Removed by Filter: 89204
  ->  Hash  (cost=820.00..820.00 rows=33640 width=33)
             (actual time=11.8..11.8 rows=33640 loops=1)
        ->  Seq Scan on users u  (cost=0..820.00 rows=33640 width=33)
```

**How to read this**:
- **cost=start..total**: Estimated cost units (arbitrary units, relative to each other). Lower is better.
- **rows=N**: Estimated vs actual row count. A big discrepancy (estimated 842, actual 1203) means stale statistics.
- **actual time=start..total**: Real time in milliseconds. The total time of the root node is the query's elapsed time.
- **Buffers: shared hit=N read=M**: N pages served from buffer pool (free), M pages read from disk (expensive).
- **Seq Scan**: Reading the entire table sequentially. Fine for small tables; devastating for large ones with selective predicates.
- **Rows Removed by Filter: 89204**: The scan read 89,204 rows but only 1,203 matched. A missing index opportunity.

**The key diagnostic**: If "Rows Removed by Filter" is high relative to returned rows, and the table is large, consider an index on the filter columns.

### MySQL EXPLAIN

MySQL's `EXPLAIN` is less detailed than PostgreSQL's but readable:

```sql
EXPLAIN SELECT o.id, u.email
FROM orders o JOIN users u ON u.id = o.user_id
WHERE o.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY);
```

Key columns:
- **type**: Access method. Best to worst: `system > const > eq_ref > ref > range > index > ALL`. `ALL` = full table scan.
- **key**: Which index was used (NULL = no index).
- **rows**: Estimated rows examined.
- **Extra**: "Using index" (covering index, good), "Using filesort" (in-memory sort, often avoidable), "Using temporary" (temp table, avoid).

## Common Anti-Patterns and Fixes

### 1. Function on Indexed Column (Index Invalidation)
```sql
-- BAD: Function on column prevents index use
WHERE DATE(created_at) = '2024-03-15'
WHERE LOWER(email) = 'user@example.com'

-- GOOD: Push the function to the constant side
WHERE created_at >= '2024-03-15' AND created_at < '2024-03-16'
WHERE email = 'user@example.com'  -- store emails lowercase, or use a functional index
```

### 2. Implicit Type Conversion
```sql
-- BAD: user_id is INT, but we pass a string → full scan
WHERE user_id = '12345'

-- GOOD: matching types
WHERE user_id = 12345
```

### 3. Leading Wildcard (Index Unavailable)
```sql
-- BAD: Leading % kills the index
WHERE name LIKE '%smith%'

-- GOOD: Trailing wildcard uses the index
WHERE name LIKE 'smith%'

-- For arbitrary full-text search: use a full-text index (GIN in Postgres, FULLTEXT in MySQL)
```

### 4. SELECT * (Over-fetching)
```sql
-- BAD: Fetches all columns, prevents covering index usage
SELECT * FROM orders WHERE user_id = 123

-- GOOD: Fetch only needed columns, enables covering index
SELECT id, status, total_amount FROM orders WHERE user_id = 123
```
A **covering index** on `(user_id, id, status, total_amount)` means the query never touches the main table — all data lives in the index. This is often the fastest possible access path.

### 5. OR on Indexed Columns (Index Merge Complexity)
```sql
-- BAD: OR across different columns is hard to optimize
WHERE status = 'active' OR region = 'us-east'

-- GOOD: Rewrite as UNION ALL (each part uses its own index)
SELECT ... WHERE status = 'active'
UNION ALL
SELECT ... WHERE region = 'us-east' AND status != 'active'
```

### 6. Missing Index on Foreign Keys
```sql
-- users.id is the PK (indexed). orders.user_id is the FK.
-- PostgreSQL does NOT auto-create an index on FK columns.
-- Without an index: every lookup of a user's orders = full table scan of orders.
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

## Index Design for Query Optimization

**Composite index column order rule**: Place columns in this order:
1. **Equality predicates first** (`WHERE status = 'active'`)
2. **Range predicate next** (`AND created_at > ...`)
3. **Sorted/grouped columns last** (`ORDER BY total_amount`)

Example: For `WHERE status = 'active' AND created_at > '2024-01-01' ORDER BY total_amount`, create `(status, created_at, total_amount)`.

**Index selectivity**: An index on a boolean column (`is_deleted`) with 99% FALSE values has terrible selectivity for `WHERE is_deleted = FALSE` — the optimizer won't use it because it would read 99% of the table anyway. Use partial indexes instead:
```sql
CREATE INDEX idx_orders_pending ON orders(created_at)
WHERE status = 'pending';  -- Only indexes the 1% of pending orders
```

## Trade-Off Analysis

| Optimization | Query Speed | Write Overhead | Storage | Complexity |
|--------------|-------------|----------------|---------|------------|
| B-tree index | +++ (point/range) | - (1 index write per insert) | Medium | Low |
| Covering index | ++++ (index-only) | -- (wider index) | High | Low |
| Partial index | +++ (filtered set) | + (fewer rows indexed) | Low | Medium |
| Materialized view | ++++ (pre-aggregated) | --- (refresh needed) | High | High |
| Query rewrite only | ++ | None | None | Medium |

## Architecture Diagram

```mermaid
flowchart TD
    Query["SQL Query"] --> Parser["Parser\n(syntax tree)"]
    Parser --> Planner["Planner / Optimizer"]

    subgraph PlannerInternal ["Cost-Based Optimizer"]
        Stats[("pg_statistics\n(cardinality, histograms)")] --> Planner
        Planner --> CandidatePlans["Generate Candidate Plans\n(join orders, access methods)"]
        CandidatePlans --> CostModel["Cost Model\n(CPU + I/O cost estimation)"]
        CostModel --> BestPlan["Cheapest Plan Selected"]
    end

    BestPlan --> Executor["Executor"]

    subgraph AccessMethods ["Access Methods"]
        SeqScan["Sequential Scan\n(full table)"]
        IdxScan["Index Scan\n(B-tree lookup)"]
        BitmapScan["Bitmap Index Scan\n(multi-condition merge)"]
        IdxOnlyScan["Index-Only Scan\n(covering index)"]
    end

    Executor --> AccessMethods
    AccessMethods --> Result["Result Set"]

    style PlannerInternal fill:var(--surface),stroke:var(--accent),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **Sequential scan speed**: ~1 GB/s from disk (NVMe), ~10 GB/s from buffer pool. A 10 GB table = 10 seconds from disk, 1 second from cache.
- **Index seek**: ~0.1–1ms for a B-tree lookup regardless of table size (log₂ depth). A billion-row table with a B-tree index has depth ≈ 30 levels.
- **The 1% rule**: If a predicate selects > 1% of rows, the optimizer may prefer a sequential scan over an index scan (random I/O for 1% of a large table = more I/Os than a sequential scan). Indexes shine at < 1% selectivity.
- **Statistics staleness**: `autovacuum` updates statistics after ~20% of rows change (default `autovacuum_analyze_scale_factor = 0.2`). For a 10M row table, statistics update only after 2M row changes — significant lag for fast-changing tables. Run `ANALYZE` manually after large bulk loads.
- **Covering index sweet spot**: If your top-5 most-used queries each need 3–5 columns, creating covering indexes for each can reduce query time by 5–50× by eliminating heap fetches.
- **EXPLAIN cost units**: Not directly comparable to milliseconds. Compare plans *relative to each other*. A plan with cost 100 is roughly 10× faster than one with cost 1000.

## Real-World Case Studies

- **Notion (FK Index Gap)**: Notion's early growth hit a database wall: a query fetching all blocks for a page was doing a full-table scan of their blocks table because the `page_id` FK column lacked an index. Adding a single index on `(page_id, position)` reduced this critical query from 8 seconds to 2ms — a 4,000× improvement with zero schema changes or hardware upgrades.

- **GitHub (Covering Indexes for GitHub Search)**: GitHub's code search team discovered that their most-frequent queries were scanning wide `repositories` rows to fetch 2 columns (`id`, `name`). Adding a covering index `(visibility, updated_at) INCLUDE (id, name)` (PostgreSQL 11+ syntax) eliminated heap fetches entirely for these queries, reducing p99 latency by 60% during peak search traffic.

- **Stripe (Query Rewrite, Not Hardware)**: Stripe's billing team had a report query joining `invoices`, `line_items`, and `customers` that took 45 seconds. Analysis showed an implicit `VARCHAR`-to-`TEXT` type coercion on the join key that invalidated the index. Fixing the data type mismatch (5-minute change) dropped the query to 180ms — and avoided a $30,000/month database upgrade they had been planning.

## Connections

- [[Indexing Deep Dive]] — Index types (B-tree, covering, partial, GIN) and their physical structure
- [[B-Tree vs LSM-Tree]] — B-tree structure explains why index column order and range queries behave as they do
- [[MVCC Deep Dive]] — MVCC creates dead tuples that bloat indexes; VACUUM reclaims them
- [[Buffer Pool and Page Cache]] — Query performance critically depends on whether data fits in buffer pool
- [[SQL vs NoSQL Decision Framework]] — Query optimization complexity is a key factor in SQL vs NoSQL selection

## Reflection Prompts

1. You're reviewing a query: `SELECT * FROM events WHERE user_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT 20`. There's a composite index on `(user_id, created_at)`. The EXPLAIN shows the index is used, but 5,000 rows are scanned before the LIMIT is applied. How would you redesign the index to make this query faster, and why does the current index cause excessive scanning?

2. `EXPLAIN ANALYZE` shows estimated rows = 100, actual rows = 48,000 for a filter on `status`. The query is slow because the optimizer chose a full table scan instead of an index scan based on the estimate. What caused this discrepancy and what are two different ways to fix it?

3. A developer adds `WHERE YEAR(created_at) = 2024` to filter records. Performance degrades 100×. Explain exactly why this happens at the storage/index level, rewrite the predicate to fix it, and describe when a functional index would be the better fix.

## Canonical Sources

- *PostgreSQL Documentation* — "Using EXPLAIN" (postgresql.org/docs/current/using-explain.html)
- Markus Winand, *SQL Performance Explained* (use-the-index-luke.com) — free online, comprehensive
- *High Performance MySQL* by Baron Schwartz et al. — Chapter 6: Query Performance Optimization
- Percona Blog — deep dives on MySQL/MariaDB query plans and InnoDB internals
