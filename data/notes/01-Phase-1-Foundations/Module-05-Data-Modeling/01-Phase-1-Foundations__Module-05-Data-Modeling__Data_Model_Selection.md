# Data Model Selection

## Why This Exists

The database you choose matters. But the data model — relational, document, or graph — often matters *more*. A document model in Postgres (JSONB) can outperform MongoDB for some workloads; a graph traversal in Neo4j can outperform a relational self-join by orders of magnitude. The model determines how naturally your data fits, how your queries are expressed, and how painful schema changes will be.

This note is about the fundamental question: *how does your application think about data, and which model matches that thinking?*

## Mental Model

Three ways to organize a recipe collection:

**Relational**: A table of recipes, a table of ingredients, a table of recipe-ingredient relationships (with quantities). To get a recipe with its ingredients, you join three tables. Perfectly structured. Adding a new attribute (allergen info) means adding a column to the ingredients table — all ingredients get it, whether they need it or not.

**Document**: Each recipe is a self-contained card: title, instructions, and an embedded list of ingredients with quantities. To get a recipe, you read one card. Adding allergen info? Just add it to the ingredients that have it — other recipes' cards are unchanged. But finding "all recipes using flour" means scanning every card.

**Graph**: Ingredients and recipes are nodes. "Uses" edges connect them, with quantity as an edge property. "Pairs well with" edges connect ingredients to other ingredients. Finding "what can I make with flour that pairs well with chicken?" is a graph traversal — fast and expressive. But simple "list all recipes" queries are no more efficient than relational.

## The Three Models in Depth

### Relational Model

Data is organized into tables (relations) with rows and columns. Relationships between entities are expressed through foreign keys and resolved through joins.

**Strengths**:
- Ad-hoc queries: SQL can express nearly any query against the schema. You don't need to anticipate access patterns at design time.
- Joins: Relating data across entities is first-class. One-to-many, many-to-many — all handled naturally.
- Strong consistency: ACID transactions, referential integrity (foreign key constraints), CHECK constraints.
- Mature tooling: 50+ years of optimization, indexing strategies, query planning.

**Weaknesses**:
- Object-relational impedance mismatch: Application objects (a User with nested Addresses and Orders) don't map 1:1 to flat tables. ORMs try to bridge this gap but add complexity and sometimes generate terrible SQL.
- Schema rigidity: Adding a column to a billion-row table can be slow (though modern databases handle this better — Postgres `ALTER TABLE ADD COLUMN` with a default is instant since v11).
- Horizontal scaling: Joins across partitions are expensive or impossible. Sharding a relational database means giving up some of its best features (see [[Partitioning and Sharding]]).

**Best for**: Most OLTP applications. Anything with complex relationships, ad-hoc query needs, or strong consistency requirements. E-commerce, SaaS, financial systems, CMS.

### Document Model

Data is stored as self-contained documents (JSON, BSON). Each document is a tree structure that can contain nested objects and arrays. Documents in the same collection don't need to have the same structure.

**Strengths**:
- Schema flexibility: Different documents can have different fields. A products collection can have electronics (with `screen_size`) and clothing (with `fabric_type`) without null columns.
- Locality: A document and all its nested data are stored together. Reading a user with their addresses and preferences is one read, not a multi-table join. This is important for read-heavy workloads with known access patterns.
- Natural mapping to application objects: A JSON document often maps directly to an application object. No ORM impedance mismatch.
- Horizontal scaling: Documents are self-contained, making them natural units for partitioning. No cross-partition joins needed if your queries are document-centric.

**Weaknesses**:
- No joins (or limited joins): MongoDB supports `$lookup` (left outer join), but it's expensive and doesn't scale across shards. If your access patterns require combining data from multiple document types, you either denormalize (duplicate data) or do application-level joins.
- Denormalization burden: Since you can't join efficiently, you copy data into documents. When the original changes, you must update every copy. This is the write overhead of denormalization.
- Many-to-many relationships are awkward: A book with multiple authors, each author with multiple books — this requires either embedding (duplicating author data in every book) or referencing (storing author IDs and doing application-level lookups). Neither is as clean as a relational join table.

**Best for**: Content management (each piece of content is a self-contained document), product catalogs (variable attributes per product type), user profiles (hierarchical, read-mostly), event logging (append-only, variable structure), applications with strong read locality needs.

**The document model in Postgres (JSONB)**: Postgres's JSONB column type gives you document-model flexibility within a relational database. You get schema-flexible JSON storage with GIN indexing, plus SQL joins, transactions, and all of Postgres's tooling. For many teams, this is the right middle ground — you don't need a separate document database.

### Graph Model

Data is modeled as nodes (entities) and edges (relationships). Both nodes and edges can have properties. Queries are expressed as graph traversals — "starting from node A, follow edges of type X to find all connected nodes of type Y."

**Strengths**:
- Relationship-rich queries: "Who are Alice's friends-of-friends who also like hiking?" In SQL, this is a self-join chain that degrades with depth. In a graph database, each hop is O(number of edges from current node), regardless of total graph size.
- Flexible schema: Nodes and edges can have arbitrary properties. New relationship types can be added without schema changes.
- Pattern matching: Cypher (Neo4j) and Gremlin query languages express graph patterns naturally: `MATCH (a:Person)-[:FRIENDS_WITH]->(b)-[:FRIENDS_WITH]->(c) WHERE a.name = 'Alice' RETURN c`.

**Weaknesses**:
- Aggregate queries: "Count all users" or "average order value" are not what graph databases are optimized for. These require scanning all nodes, which is no more efficient (and often less efficient) than a relational table scan.
- Scaling: Most graph databases (Neo4j, especially) don't shard well because graph traversals can cross any partition boundary. Distributed graph databases (Dgraph, Amazon Neptune) exist but are less mature.
- Ecosystem maturity: Smaller community, fewer operational tools, less hiring pool.

**Best for**: Social networks (friend recommendations, connection paths), fraud detection (following money flow through accounts), knowledge graphs (entity relationships in search/AI), network topology (infrastructure dependencies), recommendation engines (user-item-property graphs).

**Graphs in SQL**: Postgres supports recursive CTEs (`WITH RECURSIVE`) for graph traversals. For shallow traversals (2–3 hops), this can be competitive with a graph database. For deep or complex traversals (6+ hops, variable-length paths), a dedicated graph database is dramatically faster.

## Decision Framework

| Question | If yes → | If no → |
|----------|----------|---------|
| Do queries primarily access one entity with its nested data? | Document | — |
| Do queries join multiple entity types with complex filters? | Relational | — |
| Do queries traverse relationships of variable depth? | Graph | — |
| Is the schema highly variable across records? | Document | Relational |
| Are access patterns unknown and expected to evolve? | Relational (SQL flexibility) | Document (if patterns are stable) |
| Is write consistency critical (transactions)? | Relational or NewSQL | Document may suffice |
| Does the dataset need to scale beyond one node? | Document or NewSQL | Relational is fine |

**The reality**: Most applications use a relational model for their core data, with document-model storage for specific use cases (product attributes, user preferences, configuration). Few applications genuinely need a graph database — but the ones that do *really* need it.

## Trade-Off Analysis

| Model | Query Flexibility | Write Simplicity | Storage Efficiency | Schema Evolution | Best For |
|-------|------------------|-----------------|-------------------|-----------------|----------|
| Normalized relational (3NF) | Maximum — arbitrary joins | Complex — multi-table inserts | Excellent — no duplication | Harder — cascading migrations | OLTP, systems of record, financial data |
| Denormalized relational | Fast reads, limited joins | Moderate — update anomalies risk | Lower — duplicated data | Easier for read tables | Read-heavy APIs, reporting tables |
| Document (embedded) | Fast for document-level access | Simple — single write | Varies — embedded duplication | Easy — just add fields | User profiles, product catalogs, CMS |
| Document (referenced) | Flexible but requires app-level joins | Simple per document | Good — normalized references | Easy | Many-to-many relationships in document DBs |
| Event log / append-only | Limited without materialized views | Trivial — just append | Grows without bound | Versioned events | Audit trails, event sourcing, CDC |
| Wide-column | Fast for known access patterns | Simple per partition | Good with TTLs | Add columns freely, changing keys is hard | Time-series, IoT, message stores |

**Normalize for writes, denormalize for reads**: This is the fundamental tension. Normalization eliminates update anomalies but makes reads expensive (joins). Denormalization makes reads fast but creates update anomalies. Mature systems often normalize the write path (system of record) and maintain denormalized read models (materialized views, caches, search indexes) updated via CDC or events.

## Failure Modes

**Overnormalization causing join explosion**: A perfectly normalized schema requires 7-way joins for a common API call. Each join adds latency and contention. The database spends more time joining than scanning. Solution: denormalize the most frequently accessed paths into materialized views or read-optimized tables. Keep the normalized form as the write path.

**Denormalization update anomalies**: A customer name is stored in 15 tables (orders, invoices, shipments, etc.). The customer changes their name. You update the customers table but miss three of the denormalized copies. Now the system shows inconsistent names depending on which table a feature reads from. Solution: CDC-driven materialized views (change flows from the source of truth), or accept immutability (the name at time of order is the order's name).

**Document model unbounded growth**: An embedded array inside a document (e.g., a user's order history) grows without bound. The document exceeds MongoDB's 16MB limit, or more practically, every read of the user document now loads megabytes of order history. Solution: cap embedded arrays, reference large collections instead of embedding, use the bucket pattern for time-series data.

**Wrong partition key in wide-column stores**: Choosing a low-cardinality partition key (country, status) creates hot partitions — one partition receives 80% of traffic. Cassandra nodes owning that partition are overloaded while others are idle. Solution: use high-cardinality, well-distributed partition keys, add a bucketing suffix if needed (e.g., `user_id:date_bucket`), and load-test with production-like key distributions.

**Schemaless doesn't mean schema-free**: Without schema enforcement, document stores accumulate inconsistent data over time — some documents have `email`, others have `emailAddress`, others have `Email`. Application code becomes riddled with null checks and field name normalization. Solution: enforce schemas at the application layer (JSON Schema, Mongoose schemas, Pydantic models) even when the database doesn't require it.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Relational (Tables)"
        R1[User Table] -- "FK" --> R2[Order Table]
        R2 -- "Join" --> R3[Product Table]
    end

    subgraph "Document (JSON)"
        D1[User Document: { id, orders: [ { product, total } ] }]
    end

    subgraph "Graph (Nodes & Edges)"
        G1((User)) -- "FRIEND" --> G2((User))
        G1 -- "PURCHASED" --> G3((Product))
    end

    style R2 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style D1 fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
    style G1 fill:var(--surface),stroke:var(--border),stroke-width:1px;
```

## Back-of-the-Envelope Heuristics

- **Relationship Depth**: If your queries consistently join **> 3-4 tables**, consider denormalizing into a Document or using a Graph database.
- **Schema Variance**: If **> 30%** of your fields are NULL because they only apply to specific subtypes, use a Document model (or Postgres JSONB).
- **Read Locality**: Document models can be **2x-5x faster** for "Profile" pages because all data is fetched in a single I/O instead of multiple joins.
- **Graph Traversal**: A 5-hop relationship query in Neo4j can be **100x-1000x faster** than the equivalent self-joins in SQL.

## Real-World Case Studies

- **LinkedIn (Graph for Connections)**: LinkedIn is the quintessential use case for a Graph database. Finding "3rd-degree connections" is a recursive join nightmare in SQL but a simple breadth-first search in a graph. They built their own distributed graph database (**LI-Graph**) to handle this at scale.
- **Amazon (Relational to NoSQL)**: Amazon's retail site moved its core "shopping cart" and "order" functionality from Oracle to DynamoDB. They found that most e-commerce operations don't actually need complex joins—they just need highly available, scalable key-value access to a specific user's data.
- **The Guardian (Document for CMS)**: The Guardian newspaper uses a document model (MongoDB) for its content management system. Articles have wildly different structures (live blogs, photo galleries, long-form text), and the document model allows them to evolve the "Article" schema without expensive database migrations.

## Connections

- [[SQL vs NoSQL Decision Framework]] — This note focuses on data models; that note covers the broader database selection including operational concerns
- [[Relational Modeling and Normalization]] — Deep dive into relational modeling specifically
- [[Schema Evolution]] — How each model handles schema changes
- [[Partitioning and Sharding]] — Document and graph models have very different partitioning characteristics

## Reflection Prompts

1. You're building a system that tracks software dependencies (package A depends on package B version 2.x, which depends on C version 1.x...). Queries include: "what are all transitive dependencies of package X?", "what packages would break if we remove package Y?", and "what's the latest version of package X?" Which data model best fits these queries? Would you use one model for all three, or different models for different queries?

2. Your team stores product data in MongoDB documents. A new feature requires "find all products bought by users who also bought product X" (collaborative filtering). This is a graph-like query. What are your options without migrating to a graph database?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 2: "Data Models and Query Languages" is the essential primer; covers relational, document, and graph models with clear trade-off analysis
- *A Philosophy of Software Design* by John Ousterhout — while not database-specific, the "deep modules" concept applies: good data models hide complexity behind simple interfaces