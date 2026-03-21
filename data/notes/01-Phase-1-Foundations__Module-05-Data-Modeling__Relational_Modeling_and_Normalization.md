# Relational Modeling and Normalization

## Why This Exists

Normalization is the process of organizing data to minimize redundancy and dependency anomalies. Denormalization is the deliberate reintroduction of redundancy to improve read performance. Neither is universally "right" — they're opposite ends of a spectrum, and every real schema sits somewhere in between.

The art of relational modeling is knowing where on this spectrum to land for each part of your schema: normalize the parts that change often (to avoid update anomalies), denormalize the parts that are read frequently in predictable patterns (to avoid expensive joins).

## Mental Model

**Normalization** is like storing facts once and referencing them. A customer's address lives in one place. Every order references it. Change the address once, it's correct everywhere. But showing an order with its shipping address requires looking up the reference (a join).

**Denormalization** is like copying the address onto every order form. Showing an order is instant — everything is right there. But if the customer moves, every historical order still shows the old address (which might actually be what you want for shipping records) or you have to update hundreds of rows (which you definitely don't want).

## Normalization Forms

### First Normal Form (1NF)

Each column holds atomic (indivisible) values. No repeating groups, no arrays in columns.

**Violation**: A `phone_numbers` column containing `"555-1234, 555-5678"`. You can't easily query "find users with phone 555-5678."

**Fix**: Separate `user_phones` table with one row per phone number.

**In practice**: This is universally followed in relational databases. The one nuance: Postgres arrays and JSONB technically violate 1NF but are indexed (GIN) and queryable, making them practical for some use cases.

### Second Normal Form (2NF)

Every non-key column depends on the *entire* primary key, not just part of it. Only relevant for composite primary keys.

**Violation**: Table `order_items(order_id, product_id, product_name, quantity)`. The `product_name` depends only on `product_id`, not on the full key `(order_id, product_id)`.

**Fix**: Move `product_name` to a `products` table. Reference it via `product_id`.

### Third Normal Form (3NF)

No column depends on another non-key column (no transitive dependencies).

**Violation**: `employees(id, department_id, department_name)`. The `department_name` depends on `department_id`, which depends on `id`. That's a transitive dependency.

**Fix**: Separate `departments` table. Store `department_id` in employees, look up `department_name` via join.

### When to Stop Normalizing

**Stop at 3NF for almost everything.** Higher normal forms (BCNF, 4NF, 5NF) address increasingly obscure anomalies that rarely occur in practice. Going beyond 3NF adds more tables, more joins, and more complexity for diminishing returns.

**The practical rule**: If you can explain the data model to a new team member in 10 minutes and every fact is stored in one place, you're probably normalized enough.

## Denormalization Strategies

Once you've normalized for correctness, selectively denormalize for performance. These are the common patterns:

### Materialized Views

A precomputed query result stored as a table. The database (or a background job) refreshes it periodically or on triggers.

```sql
CREATE MATERIALIZED VIEW monthly_revenue AS
  SELECT DATE_TRUNC('month', created_at) AS month,
         SUM(total) AS revenue
  FROM orders
  WHERE status = 'completed'
  GROUP BY 1;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue;
```

**Use case**: Dashboards, reports, aggregation queries that are expensive to compute on every request. The materialized view trades freshness for speed — it's stale by the refresh interval.

**`CONCURRENTLY`** (Postgres): Refreshes the view without locking it for reads. Requires a unique index on the materialized view. Without `CONCURRENTLY`, the view is locked during refresh — reads block.

### Precomputed Aggregates

Store running aggregates alongside detailed data. Instead of computing `SUM(quantity)` across 10 million rows, maintain a `total_quantity` column on the parent entity, updated on every write.

**Implementation**: Application-level (increment on insert), database triggers, or CDC-driven background updates.

**Trade-off**: Writes are more expensive (update the aggregate on every detail change). Reads are cheap (just read the pre-computed value). Worth it when the aggregation is expensive and frequently queried.

### Read Replicas as Denormalization

Use a read replica ([[Database Replication]]) with a different index set or even materialized views optimized for read patterns. The primary is normalized for write correctness; the replica is augmented for read performance.

This separation is the operational version of CQRS (Command Query Responsibility Segregation, covered in [[Event Sourcing and CQRS]]).

### Embedding (Document-Style Denormalization in SQL)

Store related data as JSONB within the parent row:

```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  items JSONB,  -- [{product_id: 1, name: "Widget", quantity: 2, price: 9.99}, ...]
  shipping_address JSONB  -- snapshot at time of order
);
```

This eliminates the `order_items` join for the common "display an order" query. The `shipping_address` is a snapshot — the address at the time of the order, not a reference to the user's current address. This is correct for shipping records (you want the historical address, not the current one).

**When this works**: Data that's read together and written together. Data that should be a historical snapshot (not a live reference). Nested data with a bounded, known structure.

**When this fails**: Data that needs independent querying (find all orders containing product X — possible with GIN on JSONB, but less efficient than a proper join table). Data that needs referential integrity (JSONB has no foreign keys).

## Entity-Relationship Design Tips

**Start with entities and their relationships, not tables.** Draw the ER diagram first. Identify one-to-one, one-to-many, and many-to-many relationships. Then translate to tables.

**One-to-many**: Foreign key on the "many" side. `orders.user_id → users.id`.

**Many-to-many**: Join table. `book_authors(book_id, author_id)`. The join table can have its own attributes (e.g., `role` — "primary author," "editor").

**One-to-one**: Can be same table (columns) or separate table (if one side is optional or large). User core fields in `users`, optional profile details in `user_profiles`. Separate table is useful for lazy loading and schema isolation.

**Polymorphic associations**: An entity relates to one of several types. An `activity_log` entry might reference a `User`, `Order`, or `Product`. Options:
- **Shared foreign key columns**: `subject_type` + `subject_id`. Flexible but no referential integrity (can't have a foreign key that points to different tables).
- **Separate foreign key columns**: `user_id`, `order_id`, `product_id` — one is non-null per row. Has referential integrity but adds nullable columns.
- **Table-per-type**: Separate `user_activities`, `order_activities`, `product_activities` tables. Clean but adds tables.

No option is perfect. The shared approach is most common because it's simple, despite the referential integrity gap.

## Trade-Off Analysis

| Dimension | Normalized | Denormalized |
|-----------|-----------|--------------|
| Write correctness | High (one source of truth) | Risk of anomalies (duplicate data can diverge) |
| Write performance | Moderate (update one place) | Lower (update multiple copies) |
| Read performance | Lower (joins required) | Higher (data co-located or pre-computed) |
| Schema flexibility | Higher (changes in one place) | Lower (changes must propagate to all copies) |
| Storage efficiency | Higher (no duplication) | Lower (redundant data) |
| Query flexibility | Higher (SQL can join anything) | Lower (optimized for specific patterns) |

## Failure Modes

**Insertion anomaly in denormalized tables**: A wide table combining customers and orders can't store a customer who hasn't placed an order yet — the order columns would be null, violating business logic or constraints. Solution: normalize into separate tables (customers, orders) with a foreign key relationship.

**Deletion anomaly**: Deleting the last order for a customer from a combined customer-orders table accidentally deletes the customer's information too. Solution: separate entities into their own tables. The customer row persists independently of order rows.

**Update anomaly from redundancy**: A supplier's address is stored in every row of the parts table they supply. Updating the address requires changing hundreds of rows atomically. Missing one row creates an inconsistency. Solution: store the address once in a suppliers table, reference it by supplier_id from the parts table.

**Over-normalization in analytical queries**: A report requires aggregating data from 12 normalized tables. The query takes minutes because the database executes complex join plans. Solution: create materialized views or summary tables for analytical patterns, or replicate to a columnar analytics database (ClickHouse, BigQuery) where denormalized data is cheap to query.

**EAV (Entity-Attribute-Value) anti-pattern**: To avoid schema changes, a team stores everything as (entity_id, attribute_name, attribute_value) rows. Queries become impossible without multiple self-joins, there's no type safety, and indexing is useless. Solution: use JSONB columns for flexible attributes within a relational schema, or use a document database for truly schema-free entities.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Normalized Model (Write-Optimized)"
        Users[Users Table] --- Orders[Orders Table]
        Orders --- OrderItems[OrderItems Table]
        OrderItems --- Products[Products Table]
        Note right of Users: 3NF: No redundancy
    end

    subgraph "Denormalization Patterns (Read-Optimized)"
        Orders -->|1. Snapshot| Orders_D[Orders Table + ShippingAddr JSON]
        OrderItems -->|2. Aggregate| Products_D[Products Table + TotalSold]
        Users & Orders & OrderItems -->|3. View| MV[Materialized View: RevenueReport]
    end

    style Users fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style MV fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **The Join Limit**: If a critical path query requires **> 3 joins**, consider denormalizing the specific fields needed into the parent table.
- **Normalization Rule**: Normalize until it hurts, then denormalize until it works. Start at **3NF** by default.
- **Storage vs. CPU**: Denormalization trades **Disk Space** (redundant data) for **CPU/Latency** (fewer joins). In 2025, Disk is cheap; Latency is expensive.
- **Update Frequency**: If a field changes **< 1%** as often as it is read, it is a prime candidate for denormalization.

## Real-World Case Studies

- **Instagram (The `count` Denormalization)**: Instagram doesn't run `SELECT COUNT(*) FROM likes WHERE photo_id = 123` every time you view a photo. That would be catastrophic for performance. Instead, they denormalize the like count directly into the `photos` table. They use an asynchronous task to increment this counter, accepting that the count might be slightly stale in exchange for millisecond read times.
- **Stack Overflow (SQL Server Vertical Scale)**: Stack Overflow is a famous example of a highly normalized schema that scales massively. They prove that with enough RAM and expert indexing, a normalized relational model can handle millions of users on a single primary database, only denormalizing for extremely expensive "hot" paths like the home page feed.
- **Uber (Schemaless on MySQL)**: Uber found that as their schema grew, migrations on highly normalized tables became too risky. They moved to "Schemaless," a key-value store built on top of MySQL where they store most data as denormalized JSON blobs. This allowed them to trade the strictness of 3NF for the operational simplicity of a schema-on-read approach.

## Connections

- [[Data Model Selection]] — This note assumes a relational model; that note covers when to choose document or graph instead
- [[Schema Evolution]] — Denormalized schemas are harder to evolve because changes touch more tables
- [[Zero-Downtime Schema Migrations]] — The practical mechanics of changing a normalized or denormalized schema in production
- [[Indexing Deep Dive]] — Indexes are the other performance tool; often an index eliminates the need for denormalization
- [[Database Replication]] — Read replicas can serve as a denormalization layer
- [[Event Sourcing and CQRS]] — CQRS formalizes the normalized-write-model / denormalized-read-model split

## Reflection Prompts

1. You're modeling a multi-tenant SaaS application. Each tenant has users, each user has roles (admin, editor, viewer), and roles determine permissions on resources. Design the normalized schema. Now, the most common query is "can user X perform action Y on resource Z?" — this requires joining 4 tables. How would you denormalize for this query without sacrificing the ability to update roles?

2. An e-commerce database stores the product name in both the `products` table and the `order_items` table (denormalized for fast order display). A product's name changes. What happens to historical orders? Is this a bug or a feature? How do you decide which fields to snapshot and which to reference?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 2: "Data Models and Query Languages" covers the relational model's strengths and the document model's challenge to normalization
- *A Philosophy of Software Design* by John Ousterhout — Chapter on "Define Errors Out of Existence" applies to schema design: make the schema such that invalid states are unrepresentable
- Joe Celko, *SQL for Smarties* — comprehensive treatment of advanced relational modeling patterns
- Markus Winand, use-the-index-luke.com — shows how proper indexing can make joins fast enough to avoid denormalization