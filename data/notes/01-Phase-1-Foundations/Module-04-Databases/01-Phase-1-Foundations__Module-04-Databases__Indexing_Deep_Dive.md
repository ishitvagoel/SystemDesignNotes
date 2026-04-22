# Indexing Deep Dive

## Why This Exists

Without an index, finding a row in a database means scanning every row in the table. For a table with 100 million rows, that's reading potentially gigabytes of data to find a single record. An index is a data structure that lets the database jump directly to the data it needs — reducing a full table scan to a handful of page reads.

But indexes aren't free. Every index consumes storage, must be updated on every write, and adds complexity to the query planner. The art of indexing is choosing which indexes to create, how to design them for your query patterns, and knowing when *not* to index.

## Mental Model

A book index (the one at the back of a textbook) is exactly the right analogy — and in fact, the database concept was named after it. The index maps terms to page numbers. Without the index, finding every mention of "consensus" means reading the entire book. With the index, you look up "consensus" and jump directly to the relevant pages.

The trade-off is the same too: a bigger index at the back of the book means more pages in the book, and every time the book is revised, the index must be updated. A book that's constantly being rewritten needs a smaller, more focused index.

## Index Types

### B-Tree Index (The Default)

The workhorse. When you say `CREATE INDEX` without specifying a type, you get a B-tree index. The index stores key values in a sorted B-tree structure (see [[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]]), with leaf nodes pointing to the table rows.

**What it's good for**: Equality lookups (`WHERE id = 123`), range queries (`WHERE created_at > '2024-01-01'`), sorting (`ORDER BY name`), prefix matching (`WHERE name LIKE 'Ali%'`). Because keys are sorted, B-tree indexes handle all of these efficiently.

**What it's bad for**: Pattern matching that doesn't start from the left (`WHERE name LIKE '%son'` — can't use the index). High-cardinality array or JSONB containment queries. Full-text search.

**Composite indexes** (multi-column): An index on `(country, city, zip)` is sorted first by country, then by city within each country, then by zip within each city. This supports queries filtering on country alone, (country, city), or (country, city, zip) — but NOT city alone or zip alone (the leftmost prefix rule). Column order matters enormously.

**The composite index ordering strategy**: Put equality-filtered columns first (columns in `WHERE col = value`), then range-filtered columns (columns in `WHERE col > value` or `ORDER BY col`). This is the most impactful indexing decision most engineers make.

### Hash Index

A hash table mapping key values to row locations. O(1) lookups for exact equality.

**What it's good for**: Exact equality queries (`WHERE id = 'abc123'`). Nothing else.

**What it's bad for**: Range queries (hashing destroys order), sorting, prefix matching. It supports literally one operation — equality.

**In practice**: Rarely used explicitly. Postgres supports them but they're crash-unsafe in older versions (pre-10) and offer marginal benefit over B-tree for equality queries. InnoDB doesn't support standalone hash indexes (but uses adaptive hash indexes internally as a cache layer on top of B-trees). Some NoSQL databases (DynamoDB) use hash-based partitioning for their primary key, which is conceptually similar.

### GIN Index (Generalized Inverted Index)

An inverted index — maps each value to the set of rows that contain it. Think of it as the database equivalent of a search engine's index.

**What it's good for**: Array containment (`WHERE tags @> ARRAY['python', 'database']`), JSONB key/value queries (`WHERE data @> '{"status": "active"}'`), full-text search (`WHERE tsvector @@ tsquery`), trigram similarity search (`WHERE name % 'postgrs'` for fuzzy matching).

**How it works**: For a JSONB column, GIN creates entries for every key and value in every document. For an array column, it creates entries for every element. For full-text search, it creates entries for every lexeme (word stem) in every document.

**The cost**: GIN indexes are expensive to build and maintain. Every INSERT or UPDATE to an indexed column requires updating multiple index entries (one per element/key/lexeme). GIN uses a "fastupdate" buffer that batches index updates, but this means the index can be temporarily stale. Under heavy write load, GIN maintenance can become a bottleneck.

**When to use**: When you need to search *inside* values (arrays, JSONB, text). If you just need equality or range on the column as a whole, B-tree is better.

### GiST Index (Generalized Search Tree)

A balanced tree that supports arbitrary data types and predicates. Used for spatial data, range types, and nearest-neighbor searches.

**What it's good for**: Geometric/spatial queries (PostGIS: `WHERE ST_DWithin(location, point, 1000)`), range overlap (`WHERE time_range && '[2024-01-01, 2024-02-01]'`), nearest-neighbor search (`ORDER BY location <-> query_point LIMIT 10`).

**How it differs from B-tree**: B-tree only supports data types with a total ordering (numbers, strings, dates). GiST supports multi-dimensional data where "less than" doesn't make sense — you can't sort geographic points in one dimension, but you can partition them spatially.

**When to use**: PostGIS spatial queries, range type containment/overlap, exclusion constraints (prevent overlapping time ranges in a booking system).

### BRIN Index (Block Range Index)

A compact index that stores summary information (min/max values) per block range (groups of adjacent pages).

**What it's good for**: Naturally ordered data where correlated with physical storage order. Time-series tables where rows are inserted in timestamp order — a BRIN on the timestamp column is tiny (KB vs GB for a B-tree) and still enables range scans.

**What it's bad for**: Data not physically ordered by the indexed column. If the column values are random relative to storage order, BRIN provides no selectivity.

**When to use**: Large append-only tables (logs, events, time-series) where you query by time ranges. The index is 100–1000× smaller than a B-tree on the same column, which matters when the B-tree index itself would be tens of GB.

## Advanced Index Techniques

### Partial Indexes

An index on a subset of rows, defined by a WHERE clause:

```sql
CREATE INDEX idx_active_users ON users(email) WHERE active = true;
```

This indexes only active users. If 90% of users are inactive, the index is 10× smaller and 10× cheaper to maintain than a full index. Queries that include `WHERE active = true` use the partial index; others fall back to a full scan or another index.

**When to use**: When you frequently query a subset of the table. Soft-deleted records (`WHERE deleted_at IS NULL`), active subscriptions, pending orders — any flag that divides the table into a frequently-queried subset and a rarely-queried remainder.

### Covering Indexes (Index-Only Scans)

An index that includes all columns needed by a query, so the database never needs to visit the table heap:

```sql
CREATE INDEX idx_orders_covering ON orders(user_id, created_at) INCLUDE (total, status);
```

A query like `SELECT total, status FROM orders WHERE user_id = 123 AND created_at > '2024-01-01'` can be satisfied entirely from the index. This is called an **index-only scan** — it avoids the heap lookup entirely, which can be a 2–5× speedup for queries that hit many rows.

**The trade-off**: Covering indexes are larger (they store more data per entry) and more expensive to maintain (more columns to update). Use them for hot queries where the heap lookup is a proven bottleneck.

### Expression Indexes

Index on a computed expression, not a raw column:

```sql
CREATE INDEX idx_lower_email ON users(lower(email));
```

This supports queries like `WHERE lower(email) = 'alice@example.com'` — without this index, the database can't use a regular index on `email` because the function wraps the column.

## Index Selection Strategy

**Step 1**: Identify your slow queries. Use `pg_stat_statements` (Postgres) or the slow query log (MySQL). Don't guess — measure.

**Step 2**: For each slow query, check `EXPLAIN ANALYZE`. Look for sequential scans on large tables.

**Step 3**: Design the index to match the query's filter and sort columns. Remember the composite index ordering rule: equalities first, ranges second.

**Step 4**: Verify the improvement with `EXPLAIN ANALYZE` again. The planner might not use the new index if it estimates a sequential scan is cheaper (this happens with low-selectivity queries or outdated statistics — run `ANALYZE`).

**Step 5**: Monitor write performance. Every new index slows writes. If you have 15 indexes on a write-heavy table, you're paying 15× the index maintenance cost. Remove unused indexes periodically (`pg_stat_user_indexes` shows index usage counts).

## Trade-Off Analysis

| Index Type | Size | Write Cost | Best For |
|-----------|------|------------|----------|
| B-tree | Medium | Low-medium | Equality, range, sort — the default |
| Hash | Small | Low | Pure equality (rarely better than B-tree) |
| GIN | Large | High | Array, JSONB, full-text search |
| GiST | Medium | Medium | Spatial, range types, nearest-neighbor |
| BRIN | Tiny | Very low | Large, naturally ordered tables |
| Partial | Reduced | Reduced | Queries on a subset of rows |
| Covering | Larger | Higher | Index-only scans for hot queries |

## Failure Modes

- **Missing index**: A query scans 10 million rows to find 10 results. Adding a B-tree index on the filter column reduces it to 10 page reads. This is the most common performance issue in production databases — and the easiest to fix.

- **Too many indexes**: A table with 20 indexes. Every INSERT updates all 20. Write throughput collapses. Bulk loads take hours. Mitigation: audit `pg_stat_user_indexes` for unused indexes, drop them.

- **Wrong column order in composite index**: Index is `(city, country)` but the query filters on country first. The index can't be used efficiently. Mitigation: match index column order to query patterns (leftmost prefix rule).

- **Index bloat (Postgres)**: Like table bloat, dead index entries accumulate and aren't reclaimed until `REINDEX`. A bloated index is larger than necessary and slower to traverse. Mitigation: periodic `REINDEX CONCURRENTLY` or use the `pg_repack` extension.

- **Statistics staleness**: The query planner uses table statistics (column value distributions, correlation, NDV) to decide whether to use an index. If stats are stale (after a large data change), the planner may choose a sequential scan over an available index. Mitigation: `ANALYZE` runs automatically in Postgres, but can lag after bulk operations. Run it manually after large imports.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Query: WHERE age = 25"
        Scan[Sequential Scan] -->|Read 1M Rows| Result1[Slow Result]
        Index[B-Tree Index Lookup] -->|Read 3 Pages| Result2[Fast Result]
    end

    subgraph "B-Tree Index Structure"
        Root[Root Page] --> Branch[Branch Pages]
        Branch --> Leaf[Leaf Pages]
        Leaf -->|Pointer| Heap[Table Data / Heap]
    end

    subgraph "Composite Index (City, Age)"
        C1[New York, 20]
        C2[New York, 25]
        C3[Tokyo, 22]
    end

    style Root fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Heap fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Index Selectivity**: An index is most effective when it returns **< 5%** of the table's rows. If a query returns 50% of the table, the database will likely ignore the index and perform a sequential scan.
- **Index Size**: A B-tree index on a single 8-byte integer column consumes **~12-15 bytes** per row (including pointers and page overhead).
- **Write Penalty**: Each additional index typically slows down `INSERT` operations by **10-20%** due to the extra disk I/O and tree rebalancing.
- **Leftmost Prefix**: For a composite index `(A, B, C)`, you can search by `(A)`, `(A, B)`, or `(A, B, C)`, but you **cannot** efficiently search by `(B)` or `(C)` alone.

## Real-World Case Studies

- **GitLab (GIN Index Migration)**: GitLab uses Postgres for its massive metadata store. They famously struggled with searching through millions of project names and paths. By using **trigram GIN indexes**, they enabled fast fuzzy searching across the entire platform, reducing search latency from seconds to milliseconds.
- **Uber (Secondary Indexing)**: When Uber built its "Schemaless" store on top of MySQL, they realized that global secondary indexes were too expensive to maintain across shards. They moved to a system where indexes are **local to the shard**, requiring the application to aggregate results but drastically improving write throughput and availability.
- **Pinterest (BRIN for Time-Series)**: Pinterest uses **BRIN (Block Range Index)** for its massive log tables. Since logs are naturally inserted in timestamp order, a BRIN index allows them to skip millions of irrelevant rows during time-range queries while taking up **99% less space** than a standard B-tree index.

## Connections

- [[01-Phase-1-Foundations__Module-03-Storage-Engines__B-Tree_vs_LSM-Tree]] — B-tree indexes are literally B-trees; understanding their structure explains index behavior
- [[01-Phase-1-Foundations__Module-04-Databases__SQL_vs_NoSQL_Decision_Framework]] — Index capabilities are a key differentiator between database types
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__Buffer_Pool_and_Page_Cache]] — Index pages live in the buffer pool; hot indexes should be fully cached
- [[01-Phase-1-Foundations__Module-03-Storage-Engines__MVCC_Deep_Dive]] — Index entries must account for MVCC visibility (Postgres includes dead tuples in indexes)
- [[01-Phase-1-Foundations__Module-04-Databases__Partitioning_and_Sharding]] — Partition pruning + local indexes vs global indexes is a key design decision
- [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Full-Text_Search_Architecture]] — GIN indexes power full-text search in Postgres
- [[01-Phase-1-Foundations__Module-04-Databases__Query_Optimization_and_EXPLAIN]] — How the cost-based optimizer uses index statistics to choose access methods; EXPLAIN output interpretation

## Reflection Prompts

1. An e-commerce table `orders` has 500 million rows. The most common query is: `SELECT * FROM orders WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 20`. Design the optimal index. What would you change if 95% of orders have `status = 'completed'`?

2. Your table has 12 indexes. Writes are slow (50ms average INSERT). You suspect index overhead is the cause. How do you identify which indexes to drop? What's the risk of dropping an index that's "rarely used" according to statistics?

## Canonical Sources

- *Database Internals* by Alex Petrov — Chapters on B-tree indexing cover structure, splits, and optimization
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 3: "Storage and Retrieval" covers indexing fundamentals
- Postgres documentation, "Chapter 11: Indexes" — comprehensive coverage of all Postgres index types with examples
- Markus Winand, "Use The Index, Luke" (use-the-index-luke.com) — the best free resource for practical SQL indexing, covering composite indexes, partial indexes, and index-only scans