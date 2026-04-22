# Schema Evolution

## Why This Exists

Data schemas change. A field is added (tracking a new attribute), a field is removed (it's no longer needed), a type changes (string to enum), or a structure is reorganized (flat object becomes nested). In a single-process application reading its own local database, this is straightforward. In a distributed system, it's a coordination nightmare.

Consider: Service A writes events with schema v2 to Kafka. Service B still reads with schema v1 (it hasn't been deployed yet). Service C reads with schema v3 (it deployed ahead of schedule). Three services, three schema versions, all active simultaneously. If the schemas aren't compatible, messages are silently corrupted or loudly rejected.

Schema evolution is the discipline of changing data formats over time while maintaining compatibility between producers and consumers that may be on different versions at the same time. It's the data-layer equivalent of [[01-Phase-1-Foundations__Module-02-API-Design__API_Versioning_and_Compatibility]].

## Mental Model

A tax form. The IRS adds new fields to the form every year. But a taxpayer who files with last year's form shouldn't be rejected — the new fields should have sensible defaults. And a tax preparer who knows about this year's new fields should be able to handle a form from last year — the missing fields should be interpreted correctly.

**Backward compatibility**: New readers can understand old data. (New tax preparer handles old forms.)
**Forward compatibility**: Old readers can understand new data. (Old tax preparer handles new forms — ignoring fields they don't understand.)

## How Serialization Formats Handle Evolution

### Protocol Buffers (Protobuf)

Protobuf uses **field numbers** as the stable identifier for each field. The field name is for human readability; the binary encoding uses only the number.

```protobuf
message User {
  string name = 1;
  string email = 2;
  int32 age = 3;           // Added in v2
  Address address = 4;     // Added in v3
}
```

**Evolution rules**:
- **Add a field**: Assign a new, never-before-used field number. Old readers ignore unknown field numbers (forward compatible). New readers use the default value for missing fields (backward compatible).
- **Remove a field**: Stop writing it, but never reuse its field number. Old readers that still expect it get the default value. Mark it `reserved` to prevent accidental reuse.
- **Change a field name**: Safe. The name isn't in the binary format.
- **Change a field type**: Dangerous. Only specific type conversions are safe (int32 → int64, string → bytes). Most type changes are breaking.
- **Never change a field number**: This is the cardinal rule. Changing a field number effectively deletes the old field and creates a new, incompatible field.

**Default values**: Every Protobuf field has a default if not set: 0 for numbers, empty string for strings, false for booleans. This means you can't distinguish "field was explicitly set to 0" from "field was missing." The `optional` keyword (re-added in proto3) enables explicit presence tracking via `has_` methods.

### Apache Avro

Avro takes a different approach: the schema is always provided alongside the data (or resolved from a registry). Reader and writer schemas can differ, and Avro resolves differences at read time.

**How it works**: When reading, Avro compares the writer's schema (used when the data was written) with the reader's schema (expected by the current code). It maps fields by **name** (not by number like Protobuf). Fields present in the writer but not the reader are skipped. Fields present in the reader but not the writer use the reader's default value.

**Evolution rules**:
- **Add a field with a default**: Backward compatible (new readers supply the default for old data) and forward compatible (old readers ignore the unknown field).
- **Add a field without a default**: Not backward compatible — reading old data that lacks the field causes an error because there's no default to fill in.
- **Remove a field that has a default**: Forward compatible (old readers get the default for missing field). Backward compatible (new readers ignore the extra field in old data).
- **Rename a field**: Use `aliases` to map old name to new name.

**Schema resolution by name** (not number) means Avro schemas are more human-readable and refactorable, but the name becomes the stable identifier — renaming without aliases breaks compatibility.

### JSON Schema (and plain JSON)

JSON has no built-in schema evolution mechanism. It's just text. Compatibility depends entirely on application conventions:

- Extra fields in JSON are typically ignored by parsers (forward compatible by convention).
- Missing fields require application code to handle (provide defaults or error).
- Type changes are silent until runtime (a string where an integer was expected).

JSON Schema provides validation but not automatic resolution between versions. In practice, JSON-based systems rely on documentation, testing, and careful convention rather than schema-enforced compatibility.

### Comparison

| Dimension | Protobuf | Avro | JSON |
|-----------|----------|------|------|
| Field identity | Field number (stable) | Field name (stable) | Field name (convention) |
| Schema required for reading? | No (self-describing with field numbers + type tags) | Yes (writer schema must be available) | No |
| Backward compatibility | Built-in (unknown numbers ignored, defaults for missing) | Built-in (schema resolution with defaults) | By convention only |
| Forward compatibility | Built-in (unknown numbers ignored) | Built-in (unknown names skipped) | By convention (extra fields ignored) |
| Binary size | Compact (field number + type, no names) | Compact (no field identifiers in data — inferred from schema) | Verbose (field names repeated in every record) |
| Human readability | Low (binary) | Low (binary) | High (text) |
| Best for | gRPC, internal services, APIs | Kafka events, data pipelines, Hadoop | External APIs, configuration, small-scale systems |

## Schema Registries

In systems with many producers and consumers (Kafka event pipelines, for example), you need a central place to manage schemas and enforce compatibility.

**Confluent Schema Registry** (the standard for Kafka): Stores Avro, Protobuf, or JSON Schema definitions. Each schema is assigned a globally unique ID. Producers register their schema before writing; consumers fetch the schema by ID to deserialize. The registry enforces compatibility rules:

- **Backward**: New schema can read data produced with the previous schema.
- **Forward**: Previous schema can read data produced with the new schema.
- **Full**: Both backward and forward compatible.
- **None**: No compatibility checking (dangerous for production).

Compatibility is checked on schema registration — if a new schema version breaks the compatibility rule, the registry rejects it. This is the schema equivalent of API linting in CI.

**How it works with Kafka**: The producer serializes data with a schema, prefixes the message with the schema ID (a 4-byte integer), and sends to Kafka. The consumer reads the schema ID from the message, fetches the schema from the registry, and deserializes. Schema resolution (writer schema vs reader schema) happens transparently.

## Evolution Strategies for Different Systems

**Database schemas**: Handled through SQL migrations (ALTER TABLE). Covered in [[01-Phase-1-Foundations__Module-05-Data-Modeling__Zero-Downtime_Schema_Migrations]].

**Event schemas (Kafka, event sourcing)**: Use Avro or Protobuf with a schema registry. Enforce compatibility at the registry level. Events are immutable once written, so you can't update old events — the schema must be backward compatible so that new consumers can read old events.

**API schemas (REST, gRPC)**: Covered in [[01-Phase-1-Foundations__Module-02-API-Design__API_Versioning_and_Compatibility]]. Protobuf handles gRPC evolution naturally. REST/JSON uses versioning strategies.

**Configuration schemas**: Use JSON Schema or a typed configuration library. Version the configuration format alongside the application code.

## Trade-Off Analysis

| Strategy | Backward Compatible | Rollback Safety | Migration Speed | Best For |
|----------|-------------------|-----------------|-----------------|----------|
| Additive-only (add columns, nullable) | Yes — old code ignores new columns | Safe — new columns unused by old code | Instant (metadata change) | Most schema changes, continuous deployment |
| Expand-and-contract (dual-write) | Yes during transition | Safe — old column remains until cleanup | Slow — requires backfill + dual-write phase | Column renames, type changes, splitting tables |
| Versioned schemas (Avro, Protobuf) | Yes — schema registry enforces | Safe — old readers use old schema | N/A — no DB migration | Event streams, message schemas, API payloads |
| Big-bang migration (downtime window) | No — hard cutover | Risky — rollback requires reverse migration | Fast during window | Legacy systems, infrequent major restructuring |
| Shadow table migration (gh-ost, pt-osc) | Yes — operates on copy | Safe — original table untouched until swap | Hours to days for large tables | Large MySQL tables, zero-downtime DDL |

**The compatibility window**: In continuous deployment, two versions of your code run simultaneously during a deploy. Any schema change must be compatible with both the old and new code versions. This means you can never remove a column or change a type in a single deploy — you need at least two deploys: one to stop using the column, another to remove it.

## Failure Modes

- **Undiscovered incompatibility**: A producer deploys a new schema without registering it. The schema is incompatible. Consumers fail to deserialize new messages. Mitigation: enforce schema registration in the producer's serialization layer (not optional, not a linter — make it impossible to produce without registration).

- **Default value mismatch**: A new field is added with a default of `0`. Old data (written before the field existed) is read with the default `0`, but `0` is actually a valid, meaningful value. The consumer can't distinguish "missing" from "zero." Mitigation: use sentinel values or `optional` presence tracking (Protobuf proto3's `optional` keyword).

- **Schema ID collision / registry outage**: If the schema registry is unavailable, producers can't register and consumers can't fetch schemas. Mitigation: cache schemas locally on both sides, use schema registry in a highly available configuration.

- **Accidental field number reuse (Protobuf)**: A developer deletes field 3, then later adds a new field with number 3. Old data's field 3 (with the old type) is now misinterpreted as the new field's type. Silent data corruption. Mitigation: mark deleted field numbers as `reserved`.

- **The NOT NULL column migration trap (SQL)**: A developer adds a required column to a large table: `ALTER TABLE users ADD COLUMN user_tier VARCHAR(20) NOT NULL DEFAULT 'free'`. On their local database with 10,000 rows, this runs in 200ms. In production with 50 million rows, it acquires an `ACCESS EXCLUSIVE` lock on `users`, blocks all reads and writes, and runs for 18 minutes rewriting every row. The application suffers a complete outage. This trap catches engineers on PostgreSQL versions before 11 (which required full rewrites for all default columns) and still catches engineers on any Postgres version when using non-constant defaults like `DEFAULT gen_random_uuid()` or `DEFAULT now()` — these always require a table rewrite regardless of version. The safe pattern: (1) add the column as nullable with `DEFAULT 'free'` (instant in Postgres 11+), (2) backfill existing rows in batches with a `WHERE user_tier IS NULL` clause, (3) add the NOT NULL constraint via `ALTER TABLE users ADD CONSTRAINT user_tier_not_null CHECK (user_tier IS NOT NULL) NOT VALID` followed by `ALTER TABLE users VALIDATE CONSTRAINT user_tier_not_null` in a separate transaction — the `NOT VALID` + `VALIDATE` pattern holds only a `SHARE UPDATE EXCLUSIVE` lock during validation, which does not block reads or writes. See [[01-Phase-1-Foundations__Module-05-Data-Modeling__Zero-Downtime_Schema_Migrations]] for the full staged migration patterns.

## Architecture Diagram

```mermaid
graph LR
    subgraph "Producer (App v2)"
        P[App Instance] -->|1. Register Schema| SR{Schema Registry}
        P -->|2. Encode with ID| Msg[Message: {id: 105, data: bin}]
    end

    subgraph "Event Stream"
        Msg --> Kafka[(Kafka Topic)]
    end

    subgraph "Consumers"
        Kafka --> C1[Consumer App v1]
        Kafka --> C2[Consumer App v2]
        
        C1 -->|3. Fetch ID 105| SR
        C1 -->|4. Resolve: Skip Unknown| Read1[Old Logic]
        
        C2 -->|3. Fetch ID 105| SR
        C2 -->|4. Resolve: All Fields| Read2[New Logic]
    end

    style SR fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Kafka fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Cardinal Rule**: Never reuse a field number (Protobuf) or rename a field without an alias (Avro).
- **Additive by Default**: 90% of schema changes should be **adding** new nullable/optional fields. This is always safe.
- **Breaking Change Detection**: If you MUST change a field's type or remove a required field, treat it as a **Major Version** change (e.g., move from `topic_v1` to `topic_v2`).
- **Binary Size**: Protobuf/Avro are typically **5x - 10x smaller** than JSON for the same data, primarily due to removing redundant field names.

## Real-World Case Studies

- **LinkedIn (Avro/Schema Registry)**: LinkedIn created the first **Schema Registry** because they hit a wall with JSON-over-Kafka. They found that without an enforced schema, their downstream data warehouse (Hadoop) was constantly breaking because a developer would change a field name in a microservice without telling the data team.
- **Google (Protobuf Tag Reuse)**: Google has internal stories of "Production Outages of the Week" caused by reusing a Protobuf tag number that had been deleted years earlier. This led to the creation of the `reserved` keyword, which is now a standard practice in all Protobuf definitions to prevent "zombie tags."
- **Stripe (API Mapping)**: Stripe handles schema evolution differently. They maintain **API Versions** by date. When they change their internal schema, they use a "Transformation Layer" that maps the current internal format back to every previous version's format, ensuring that a request using a 2015 schema still works perfectly in 2025.

## Connections

- [[01-Phase-1-Foundations__Module-02-API-Design__API_Versioning_and_Compatibility]] — Schema evolution is the data-layer parallel of API evolution
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_vs_REST_vs_GraphQL]] — gRPC uses Protobuf evolution natively; GraphQL deprecation is another approach
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Zero-Downtime_Schema_Migrations]] — Database schema evolution through SQL migrations
- [[03-Phase-3-Architecture-Operations__Module-12-Architectural-Patterns__Event_Sourcing_and_CQRS]] — Immutable event logs require forward-compatible schema evolution
- [[01-Phase-1-Foundations__Module-05-Data-Modeling__Data_Model_Selection]] — Schema evolution behaves differently across relational, document, and graph models

## Reflection Prompts

1. Your Kafka pipeline uses Avro with full compatibility mode. A team wants to change a field from `string` to an `enum` (restricting allowed values). Is this backward compatible? Forward compatible? How would you implement this change without breaking existing consumers?

2. You discover that a Protobuf message has field 7 marked as `reserved` with no comment explaining why. What's the risk of removing the `reserved` annotation and reusing field 7? How would you investigate what field 7 used to be?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 4: "Encoding and Evolution" is the definitive treatment of schema evolution across formats
- Confluent documentation, "Schema Evolution and Compatibility" — practical guide to Avro schema evolution with the schema registry
- Protocol Buffers Language Guide (protobuf.dev) — official Protobuf schema evolution rules
- Apache Avro specification — schema resolution rules for reader/writer schema compatibility