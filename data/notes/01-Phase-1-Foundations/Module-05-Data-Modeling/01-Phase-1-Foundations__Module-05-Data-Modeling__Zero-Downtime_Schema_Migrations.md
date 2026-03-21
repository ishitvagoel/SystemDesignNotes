# Zero-Downtime Schema Migrations

## Why This Exists

You need to add a column, rename a table, change a column type, or restructure a table. In development, you run `ALTER TABLE` and wait. In production, that table has 500 million rows, 10,000 queries per second, and an SLA of 99.99% uptime. A naive `ALTER TABLE` can lock the table for minutes or hours, blocking all reads and writes. That's an outage.

Zero-downtime schema migrations are techniques for changing a database schema while the application continues to serve traffic without errors or degraded performance. This is one of the most operationally difficult tasks in database management — and one of the most common.

## Mental Model

Renovating a restaurant kitchen while serving dinner. You can't close the restaurant. You can't tell the chefs to stop cooking. You build the new counter next to the old one, gradually move operations to the new counter, then remove the old one. At no point does a dish stop being served.

## The Expand-and-Contract Pattern

The master pattern for zero-downtime migrations. Every safe migration can be decomposed into three phases:

### Phase 1: Expand

Add the new structure alongside the old one. Both exist simultaneously. The application writes to both (or the new one populates from the old via a backfill).

### Phase 2: Migrate

Update the application to read from the new structure. Verify correctness. Backfill any remaining data.

### Phase 3: Contract

Remove the old structure. Clean up dual-write logic.

**The key principle**: At every point during the migration, the application works correctly. Old code works with the current schema. New code works with the current schema. There is no moment where the schema and code are incompatible.

## Common Migration Scenarios

### Adding a Column

**The easy case (Postgres 11+)**: `ALTER TABLE orders ADD COLUMN tracking_id TEXT DEFAULT NULL;`

In modern Postgres, adding a nullable column or a column with a constant default is instant — it only modifies the catalog, not the data. No table rewrite, no lock (beyond a brief ACCESS EXCLUSIVE lock to update the catalog).

**The hard case**: Adding a column with a default computed from existing data, or adding a NOT NULL column. These require rewriting every row.

**Safe approach for NOT NULL with default**:
1. Add the column as nullable: `ALTER TABLE orders ADD COLUMN status TEXT;`
2. Backfill existing rows: `UPDATE orders SET status = 'active' WHERE status IS NULL;` (do this in batches to avoid locking the table for the entire update)
3. Set NOT NULL constraint: `ALTER TABLE orders ALTER COLUMN status SET NOT NULL;` (Postgres validates all rows — on a large table, this can be slow. Use `ALTER TABLE orders ADD CONSTRAINT status_not_null CHECK (status IS NOT NULL) NOT VALID;` then `ALTER TABLE orders VALIDATE CONSTRAINT status_not_null;` to validate without holding a heavy lock.)

### Renaming a Column

**Never rename directly in production.** `ALTER TABLE orders RENAME COLUMN amount TO total;` instantly breaks every query referencing `amount`.

**Expand-and-contract approach**:
1. **Expand**: Add the new column `total`. Create a trigger that copies `amount` → `total` on every write (keeps both in sync). Backfill existing rows.
2. **Migrate**: Update application code to read/write `total` instead of `amount`. Deploy.
3. **Contract**: Drop the trigger. Drop the `amount` column.

This takes three deployments and possibly weeks, but zero downtime.

### Changing a Column Type

Changing `VARCHAR(50)` to `TEXT` is instant in Postgres (it's a metadata change). Changing `INT` to `BIGINT` requires a full table rewrite.

**Safe approach for type changes requiring rewrite**:
1. Add a new column with the desired type
2. Dual-write: application writes to both columns
3. Backfill the new column from the old
4. Switch reads to the new column
5. Stop writing to the old column
6. Drop the old column

### Splitting a Table

A `users` table with 50 columns needs to be split into `users` (core fields) and `user_profiles` (optional fields).

**Approach**:
1. Create the new `user_profiles` table
2. Application writes to both tables (dual-write) or a trigger copies data
3. Backfill `user_profiles` from existing `users` data
4. Switch reads to use JOIN or separate queries
5. Drop the migrated columns from `users`

### Adding an Index

`CREATE INDEX` on a large table locks the table for writes (in Postgres without `CONCURRENTLY`).

**Safe approach**: `CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);`

`CONCURRENTLY` builds the index in the background without locking writes. It takes longer (two table scans instead of one) and can't run inside a transaction, but it doesn't block production traffic.

**Gotcha**: If `CREATE INDEX CONCURRENTLY` fails (timeout, out of disk space), it leaves an invalid index behind. Check `pg_indexes` for `invalid` indexes and drop them before retrying.

## Ghost Table Migrations

For large-scale changes that require rewriting the table (column type change on a billion-row table), the expand-and-contract pattern at the column level is impractical. Ghost table migrations operate at the table level:

**How it works** (gh-ost, pt-online-schema-change):
1. Create a ghost (shadow) table with the desired schema
2. Copy data from the original table to the ghost table in chunks
3. Capture ongoing changes to the original table (via triggers or binlog) and apply them to the ghost table
4. When the ghost table is caught up, atomically swap: rename original → old, rename ghost → original
5. Drop the old table

**gh-ost** (GitHub's Online Schema Change for MySQL): Reads the MySQL binary log to capture changes, avoiding triggers entirely. This reduces write amplification on the original table and avoids trigger-related locking issues.

**pt-online-schema-change** (Percona): Uses triggers on the original table to capture changes. Simpler to set up but adds write overhead due to triggers.

**pgroll** and **reshape** (Postgres): Newer tools for Postgres that manage expand-and-contract migrations with versioned schema views, allowing old and new application versions to coexist during migration.

**Risks of ghost table migrations**:
- The swap is an atomic rename, but foreign key constraints referencing the original table must be dropped and recreated — this can be disruptive.
- If the ghost table falls behind (write throughput to the original exceeds the migration speed), the migration never converges. Mitigation: throttle the migration to limit I/O impact, run during lower-traffic periods.
- The migration doubles storage temporarily (original + ghost table).

## Migration Sequencing with Application Deploys

The most dangerous moment in a migration is when the database schema and the application code are out of sync. The rule: **the database change must be compatible with both the old and new application code.**

**Safe deployment order**:
- **Adding a column**: Migrate DB first (add column), then deploy app (use column). Old app ignores the new column.
- **Removing a column**: Deploy app first (stop using column), then migrate DB (drop column). New app doesn't reference the dropped column.
- **Renaming**: Three-step expand-and-contract as described above. Never a single-step rename.

**Rolling deployments complicate this**: During a rolling deploy, some instances run the old code and some run the new. Both versions must work with the current schema. This means migrations must be backward compatible (old code works) and forward compatible (new code works) — exactly the same principles as [[Schema Evolution]] and [[API Versioning and Compatibility]].

## Trade-Off Analysis

| Tool / Approach | Lock Behavior | Table Size Limit | Replication Aware | Best For |
|----------------|--------------|-------------------|-------------------|----------|
| ALTER TABLE (PostgreSQL) | Many operations are non-blocking in PG 11+ | Unlimited for metadata changes | Yes — replicated normally | Adding nullable columns, creating indexes CONCURRENTLY |
| gh-ost (GitHub) | No triggers, binlog-based | Tested at multi-TB | Yes — throttles based on replica lag | Large MySQL tables, production-safe |
| pt-online-schema-change (Percona) | Trigger-based — adds overhead | Multi-TB | Monitors replica lag | MySQL when gh-ost isn't available |
| Flyway/Liquibase (migration runners) | Depends on SQL inside | N/A — just orchestration | No — must handle manually | Migration versioning, CI/CD integration |
| Expand-and-contract (manual) | Application-controlled | Any | Yes — you control pacing | Complex restructurings across multiple tables |

**The index creation trap**: Creating an index on a large table can lock writes for hours if done naively. PostgreSQL's `CREATE INDEX CONCURRENTLY` solves this but takes longer and can fail (leaving an invalid index). MySQL requires gh-ost or pt-osc for truly non-blocking index additions on large tables. Always test migration duration on a production-sized copy before running in production.

## Failure Modes

- **Long-running migration blocks writes**: A naive `ALTER TABLE ADD COLUMN ... DEFAULT compute_something()` locks the table while rewriting every row. On a 500M-row table, this can take hours. Mitigation: use the staged approach (add nullable, backfill in batches, add constraint).

- **Migration + deploy mismatch**: App code deployed before the migration. The new code references a column that doesn't exist yet. 500 errors. Mitigation: always migrate the database first for additive changes. Use feature flags to gate new code behind the migration.

- **Backfill overwhelms the database**: Updating 100 million rows in one `UPDATE` statement generates a massive WAL entry, bloats MVCC dead tuples (Postgres), and spikes I/O. Mitigation: batch updates (`WHERE id BETWEEN 1 AND 10000`, sleep between batches), throttle, run during off-peak.

- **Ghost table migration divergence**: The original table receives writes faster than the ghost table can apply them. The migration never completes. Mitigation: monitor the gap between original and ghost. If it's growing, reduce write load or increase migration throughput.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Phase 1: Expand (Dual Write)"
        App1[App v1] -->|1. Write| Col_Old[Column: amount]
        App1 -.->|2. Trigger / App Logic| Col_New[Column: total]
    end

    subgraph "Phase 2: Migrate (Verify)"
        App2[App v2] -->|3. Read| Col_New
        App2 -->|4. Write| Col_New
        App2 -->|5. Write| Col_Old
    end

    subgraph "Phase 3: Contract (Cleanup)"
        App3[App v3] -->|6. Read/Write| Col_New
    end

    style Col_New fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Col_Old fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **Batch Size for Backfills**: Use batches of **1,000 - 5,000 rows**. Larger batches increase lock duration and WAL bloat; smaller batches increase total overhead.
- **Sleep Between Batches**: A **50ms - 100ms sleep** between batches allows the database's background processes (autovacuum, replication) to catch up.
- **Lock Timeout**: Set a `lock_timeout` of **~100ms - 500ms** for DDL. It's better for the migration to fail and retry than to block the entire application's connection pool.
- **Storage Buffer**: Staged migrations (like ghost tables) temporarily **double the disk space** needed for the affected table. Ensure you have > 50% free disk before starting.

## Real-World Case Studies

- **GitHub (gh-ost)**: GitHub built **gh-ost** because they found that trigger-based migration tools (like pt-online-schema-change) were causing too much load on their primary MySQL clusters. gh-ost uses the binary log to stream changes to a shadow table, allowing them to perform multi-terabyte migrations with zero impact on application latency.
- **Stripe (Online Schema Migrations)**: Stripe documented a system where they use **Postgres Views** to manage migrations. They create a view that presents the "New" schema to the application, while the underlying tables are still being migrated. This allows them to decouple code deployment from the actual database state.
- **Facebook (The OSC Tooling)**: Facebook runs one of the world's largest MySQL deployments. They use an internal "Online Schema Change" (OSC) tool that is integrated with their automation. It automatically throttles migrations based on replica lag and global database health, ensuring that a migration in one region doesn't cause a cascading failure across their global infrastructure.

## Connections

- [[Schema Evolution]] — Zero-downtime migrations are the operational implementation of schema evolution principles
- [[API Versioning and Compatibility]] — The expand-and-contract pattern is identical for APIs and schemas
- [[Write-Ahead Log]] — Large migrations generate significant WAL, affecting replication lag and disk usage
- [[Database Replication]] — Migrations on the primary propagate to replicas; replica lag can spike during migrations
- [[Deployment and Release Engineering]] — Database migrations must be coordinated with application deployment strategies
- [[Relational Modeling and Normalization]] — Schema migrations implement modeling changes in production

## Reflection Prompts

1. You need to change a `user_id` column from `INT` to `BIGINT` on a table with 2 billion rows in Postgres. The table receives 5,000 writes per second. What's your migration plan? How long will it take? What are the risks at each stage?

2. Your team uses a CI/CD pipeline that applies database migrations automatically before deploying new code. A developer accidentally pushes a migration that drops a column still used by the running code. How do you prevent this? What safeguards should the migration pipeline include?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 4 covers schema evolution principles that underpin migration strategies
- GitHub Engineering Blog, "gh-ost: GitHub's Online Schema Migrations for MySQL" — the tool and the philosophy behind triggerless online DDL
- Postgres documentation, "ALTER TABLE" — details on which ALTER TABLE operations are instant vs require table rewrite
- *Building Microservices* by Sam Newman (2nd ed) — Chapter on database management covers expand-and-contract in the context of service decomposition
- Andrew Kane, "Strong Migrations" (Ruby gem + blog) — practical guide to safe Postgres migrations, with a list of dangerous operations and safe alternatives