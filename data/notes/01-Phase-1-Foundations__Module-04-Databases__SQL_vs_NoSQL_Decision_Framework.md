# SQL vs NoSQL Decision Framework

## Why This Exists

"Should we use SQL or NoSQL?" is one of the most frequently asked — and most frequently misframed — questions in system design. The framing implies two monolithic camps, when in reality there are at least five distinct data models (relational, document, wide-column, key-value, graph), each optimized for different access patterns. The choice isn't about ideology or fashion; it's about matching the database to how your application reads and writes data.

The NoSQL movement emerged around 2009–2012, driven by real problems: relational databases struggled with the write throughput, horizontal scaling, and schema flexibility that companies like Google, Amazon, and Facebook needed. But the pendulum swung too far — many teams adopted NoSQL for workloads where a relational database was the obviously better choice, then spent years building ad-hoc query capabilities, transaction support, and schema enforcement that PostgreSQL provides out of the box.

The honest answer for most applications: **start with PostgreSQL.** Move to something else when you have concrete evidence that Postgres can't handle your specific workload. This note gives you the framework for when that moment arrives.

## Mental Model

Think of databases as vehicles:

- **Relational (Postgres, MySQL)**: A sedan. Excellent for the vast majority of trips. Comfortable, reliable, efficient. Not the fastest on the track, not the best off-road, but good at almost everything.
- **Document (MongoDB, DynamoDB)**: An SUV. Great when your "cargo" (data) comes in irregularly shaped boxes (variable schemas). Better at rough terrain (horizontal scaling), but less fuel-efficient on the highway (complex queries across documents).
- **Wide-column (Cassandra, ScyllaDB)**: A semi-truck. Handles massive throughput on known routes (predefined query patterns). Terrible at improvising new routes (ad-hoc queries).
- **Key-value (Redis, DynamoDB in KV mode)**: A motorcycle. Blazingly fast for simple point-to-point trips. Can't carry much.
- **Graph (Neo4j, Neptune)**: A helicopter. Goes directly between any two points (multi-hop relationships) without following roads. Expensive, doesn't scale the same way, but unbeatable for the problems it's designed for.

## The Decision Framework

### Step 1: Characterize Your Access Patterns

Before choosing a database, write down your top 5–10 queries. Not the schema — the queries. What does your application actually *ask* for?

- "Get user by ID" → Point lookup
- "Get all orders for user X in the last 30 days, sorted by date" → Range scan with filter
- "Find the cheapest product in category Y matching search terms" → Complex query with sorting and filtering
- "Who are user X's friends-of-friends?" → Graph traversal
- "Append 500,000 sensor readings per second" → High-throughput writes

Your query patterns determine your database, not the other way around.

### Step 2: Match to Data Model

| Access Pattern | Best Fit | Why |
|----------------|----------|-----|
| CRUD with complex queries, joins, aggregations | Relational (Postgres, MySQL) | SQL is purpose-built for ad-hoc queries on structured data |
| Variable-schema entities, nested documents, tree structures | Document (MongoDB, DynamoDB) | Documents map naturally to JSON-like application objects |
| High write throughput, known query patterns, wide rows | Wide-column (Cassandra, ScyllaDB) | Optimized for write-heavy workloads with partition-key-based access |
| Simple get/set by key, caching, session storage | Key-value (Redis, DynamoDB, etcd) | Minimal overhead for point lookups by key |
| Multi-hop relationship traversal | Graph (Neo4j, Neptune, DGraph) | Graph traversal is O(relationships), not O(table size) like SQL joins |
| Time-series (metrics, events, IoT) | Time-series (TimescaleDB, InfluxDB, QuestDB) | Optimized for time-ordered ingestion and time-range queries |
| Full-text search with relevance ranking | Search engine (Elasticsearch, OpenSearch) | Inverted indexes, BM25, analyzers — purpose-built for text search |

### Step 3: Evaluate Operational Requirements

Data model fit isn't the whole story. Consider:

**Transaction requirements**: If you need multi-row, multi-table transactions with ACID guarantees (payments, inventory, financial records), relational databases are the default. Some NoSQL databases offer limited transaction support (MongoDB multi-document transactions, DynamoDB TransactWriteItems), but they're typically more constrained and less mature. If transactions are critical, start with Postgres.

**Consistency requirements**: Relational databases default to strong consistency. Many NoSQL databases default to eventual consistency (Cassandra, DynamoDB) with tunable levels. If you need "read your own writes" and "no stale reads" without application-level complexity, strong consistency is easier with SQL. See [[Consistency Spectrum]].

**Scale requirements**: If your data fits on one machine (up to ~1TB of active data, ~50,000 QPS with good hardware), a single Postgres instance is usually sufficient. Replication handles read scaling. Sharding is needed only when a single node can't handle the write throughput or data volume. Many teams shard too early — it adds enormous operational complexity ([[Partitioning and Sharding]]).

**Schema flexibility**: If your data structure genuinely varies across records (different products have different attributes, user-generated content with arbitrary fields), document databases handle this more naturally than relational schemas with nullable columns or EAV patterns. But Postgres's JSONB column type gives you document-store flexibility within a relational database — often good enough.

**Operational maturity**: Postgres and MySQL have decades of tooling, expertise, monitoring, backup strategies, and community knowledge. Choosing a newer or more niche database means less tooling, fewer experts to hire, and less battle-tested operational practices. This is a real cost.

## The "Just Use Postgres" Argument (and Its Limits)

Postgres is remarkably versatile:
- JSONB columns for document-like storage
- Full-text search with `tsvector` and GIN indexes
- PostGIS for geospatial queries
- pgvector for vector similarity search
- Partitioned tables for time-series data (TimescaleDB extends this further)
- Logical replication for CDC
- Strong ACID transactions

**When Postgres stops being enough**:
- Write throughput exceeds what a single node can handle (even after optimizing indexes, connection pooling, and query patterns). This is typically 50,000–100,000 writes/sec depending on hardware and write complexity.
- Data volume exceeds what fits on a single node with reasonable cost. Postgres on a 10TB SSD is fine; Postgres managing 100TB gets expensive and operationally fragile.
- You need true multi-region active-active writes with conflict resolution. Postgres logical replication can do multi-region reads, but active-active writes require conflict resolution that Postgres doesn't natively handle well. This is where CockroachDB, Spanner, or DynamoDB global tables enter the picture.
- Your access pattern is fundamentally not relational: deep graph traversals (Neo4j), sub-millisecond key-value lookups at millions QPS (Redis), or append-only event streams (Kafka — not a database, but often used as one).

## Common Anti-Patterns

**"NoSQL because it's faster"**: NoSQL isn't inherently faster. A well-indexed Postgres query is microseconds. NoSQL is faster for *specific access patterns* (key-value lookups, high-throughput writes) — not universally.

**"NoSQL because we need to scale"**: Most applications don't need the horizontal write scaling that NoSQL provides. Read scaling (replicas) is trivial with any database. If your data fits on one node, sharding adds complexity for zero benefit.

**"MongoDB because our data is JSON"**: Postgres JSONB handles JSON natively, with indexing. You only need a document database if you *also* need schema flexibility across millions of documents *and* horizontal scaling *and* your queries don't require joins.

**"We'll use multiple databases from the start"**: Polyglot persistence (different databases for different services) sounds elegant but adds operational overhead (multiple backup strategies, multiple monitoring systems, multiple failure modes, multiple expertise requirements). Start with one database. Add others only when a specific service has a need that demonstrably can't be met.

**"Cassandra for everything because it scales"**: Cassandra requires you to model data around your queries. Adding a new query pattern often requires a new table with denormalized data. If your query patterns evolve (they always do), Cassandra's rigid data modeling becomes a burden. It's excellent for write-heavy workloads with known, stable query patterns. It's terrible for exploratory queries and evolving requirements.

## Trade-Off Analysis

| Database Type | Schema Flexibility | Query Power | Scale-Out | Consistency | Best For |
|--------------|-------------------|-------------|-----------|-------------|----------|
| Relational (PostgreSQL, MySQL) | Rigid schema, migrations required | Full SQL, joins, aggregations | Vertical primarily, read replicas | ACID transactions | Complex queries, relationships, financial data |
| Document (MongoDB, DynamoDB) | Flexible, schema-per-document | Rich queries on documents, no joins | Horizontal with sharding | Tunable, eventually consistent by default | User profiles, catalogs, content management |
| Wide-column (Cassandra, ScyllaDB) | Column families, flexible columns | Limited — partition-key-based access | Excellent horizontal | Tunable per query | Time-series, IoT, high-write throughput |
| Key-value (Redis, DynamoDB in KV mode) | None — opaque values | GET/SET only | Excellent | Varies | Caching, sessions, feature flags |
| Graph (Neo4j, Neptune) | Flexible nodes/edges | Traversal queries, path finding | Limited horizontal | ACID in Neo4j | Social networks, fraud detection, recommendations |

**The real decision**: Most teams don't need to choose one. Production systems commonly use PostgreSQL as the system of record, Redis for caching and rate limiting, and Elasticsearch or a document store for search. The question isn't "SQL or NoSQL?" — it's "which data access patterns does each part of my system have, and what's the best fit for each?"

## Failure Modes

**Premature NoSQL adoption**: A team picks MongoDB because "we need to be web scale" for a 10GB dataset with complex relationships. They end up reimplementing joins, transactions, and constraints in application code — poorly. Two years later they migrate to PostgreSQL. Solution: start with a relational database unless you have a specific reason not to (schema-free requirements, massive write throughput, specific data model needs).

**Relational schema rigidity at scale**: A growing product needs to store increasingly diverse user-generated content. Every new content type requires a schema migration, coordination across teams, and deployment risk. The ALTER TABLE queue becomes a bottleneck. Solution: use JSONB columns for flexible attributes within a relational schema, or migrate flexible entities to a document store while keeping the relational core.

**NoSQL query pattern lock-in**: DynamoDB or Cassandra data is modeled for one specific query pattern (partition key + sort key). A new feature requires a different access pattern that doesn't align with the table design. Adding a secondary index is expensive or doesn't support the query. Solution: model for all known access patterns upfront (single-table design in DynamoDB), or accept that a new access pattern may require a new table or a different database entirely.

**Consistency assumptions mismatch**: Developers write code assuming strong consistency (read-after-write) but deploy against an eventually consistent store. Race conditions that never appeared in development (single node) appear in production (replicated cluster). Solution: explicitly document the consistency model of each data store, test with artificial replication lag, and use consistency-appropriate access patterns.

**Vendor lock-in with proprietary NoSQL**: Building on DynamoDB's proprietary API, single-table design, and streams means the entire data layer is AWS-specific. Migrating to another cloud requires rewriting the data access layer. Solution: evaluate the lock-in cost upfront, use open-source alternatives (ScyllaDB, Cassandra) if multi-cloud is a requirement, or accept the lock-in if the managed service value outweighs it.

## Architecture Diagram

```mermaid
flowchart TD
    A[Analyze Access Patterns] --> B{Need ACID & Joins?}
    
    B -- Yes --> C{Massive Scale?}
    B -- No --> D{Flexible Schema?}
    
    C -- No --> E[PostgreSQL / MySQL]
    C -- Yes --> F[NewSQL / Distributed SQL]
    
    D -- Yes --> G[Document DB MongoDB]
    D -- No --> H{High Write Throughput?}
    
    H -- Yes --> I[Wide-Column Cassandra]
    H -- No --> J[Key-Value Redis]
    
    classDef primary fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    classDef secondary fill:var(--bg2),stroke:var(--border),stroke-width:1px;
    class A,B,C,D,H secondary;
    class E,F,G,I,J primary;
```

## Back-of-the-Envelope Heuristics

- **PostgreSQL Limits**: A well-tuned Postgres instance on heavy hardware can handle **~50k - 100k Writes/sec** and **~500k Reads/sec**.
- **Storage Limits**: Vertically scaling a single relational DB starts getting very expensive past **10TB of active data**.
- **Cassandra/DynamoDB Scale**: Wide-column and KV stores have effectively infinite scaling. DynamoDB handles peaks of **100M+ requests per second** during Amazon Prime Day.
- **Cost**: NoSQL managed services (like DynamoDB) charge per read/write unit. They are incredibly cheap at low volumes but can become **10x more expensive** than a provisioned Postgres instance under constant, heavy load.

## Real-World Case Studies

- **Discord (MongoDB -> Cassandra -> ScyllaDB)**: Initially launched on MongoDB, but migrated to Cassandra as message volume hit billions per day. Recently migrated to ScyllaDB (C++) for better tail latency and fewer garbage collection pauses.
- **Uber (Postgres -> Schemaless -> MySQL)**: Famously migrated away from Postgres due to write-amplification issues with secondary indexes (pre-Postgres 10). They built a NoSQL layer on top of MySQL to handle their specific scaling needs.
- **Stack Overflow (Cassandra -> SQL Server)**: Achieves massive scale using a surprisingly traditional, vertically-scaled SQL Server setup, proving that NoSQL is not a strict requirement for high traffic if queries are heavily cached and well-indexed.

## Connections

- [[Storage Engine Selection]] — The storage engine (B-tree vs LSM) is often determined by the database choice
- [[Indexing Deep Dive]] — Index capabilities vary dramatically across database types
- [[Data Model Selection]] — The data modeling note in Module 5 goes deeper into relational vs document vs graph model choices
- [[Database Replication]] — Different databases offer different replication models
- [[Partitioning and Sharding]] — Scaling strategy depends on the database's native partitioning capabilities
- [[NewSQL and Globally Distributed Databases]] — The "third way" that combines SQL's consistency with NoSQL's horizontal scaling
- [[Consistency Spectrum]] — NoSQL databases' tunable consistency is a feature and a foot-gun

## Reflection Prompts

1. A startup is building a social fitness app. Core features: user profiles, workout logs (structured but varying by exercise type), a social feed (timeline of friends' workouts), and leaderboards. They're debating between Postgres, MongoDB, and DynamoDB. Walk through the decision for each core feature. Would you use one database or multiple?

2. Your team's Postgres instance handles 20,000 writes/sec and 80,000 reads/sec on a single node. A tech lead proposes migrating to Cassandra "because we need to scale for next year's projected growth" of 2× traffic. What questions do you ask before agreeing to the migration?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 2: "Data Models and Query Languages" is the essential primer on relational vs document vs graph models
- *System Design Interview* by Alex Xu — chapters on specific system designs demonstrate database selection in context
- Postgres documentation — the breadth of capabilities (JSONB, FTS, PostGIS, pgvector) is worth understanding before reaching for another database
- Rick Houlihan, "Advanced Design Patterns for Amazon DynamoDB" (re:Invent talk) — the single best resource for understanding NoSQL data modeling constraints and capabilities