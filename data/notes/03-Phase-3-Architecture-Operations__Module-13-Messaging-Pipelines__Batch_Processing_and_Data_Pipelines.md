# Batch Processing and Data Pipelines

## Why This Exists

Not everything needs real-time processing. Training an ML model on last month's data, generating a monthly revenue report, rebuilding a search index from scratch — these are batch jobs. Batch processing reads a bounded input dataset, computes over it, and produces an output. It's the oldest form of data processing and remains essential even as streaming grows.

This note also covers the data pipeline infrastructure that moves data between systems: data lakes, warehouses, and the ETL/ELT patterns that populate them.


## Mental Model

Batch processing is doing laundry. You don't wash each shirt the moment it gets dirty (that would be stream processing). You accumulate dirty clothes in a hamper, then wash the whole batch at once — it's more efficient per item, but each shirt waits until the next laundry cycle. A data pipeline is the full laundry system: collect dirty clothes (ingest), sort by color and fabric (transform), wash and dry (process), fold and put away (load into destination). The Lambda architecture runs two laundry systems in parallel — a daily deep-clean batch and a quick spot-clean stream for urgent items. The Kappa architecture says: just make the spot-clean system fast and thorough enough to replace the deep-clean entirely.

## Batch Processing Evolution

**MapReduce (2004)**: Google's paper introduced fault-tolerant distributed batch processing. Map phase: transform each input record independently. Reduce phase: aggregate results by key. Hadoop brought MapReduce to the open-source world. Revolutionary at the time, but verbose (writing Map/Reduce functions in Java for simple aggregations) and slow (writes intermediate results to disk between stages).

**Apache Spark (2014+)**: Replaced MapReduce's disk-heavy model with in-memory computation. Spark's RDD (Resilient Distributed Dataset) and DataFrame APIs are dramatically more expressive and 10–100× faster for iterative computations. Spark is the de facto standard for batch processing today.

**Modern engines**: DuckDB (single-node analytical engine, embedded), Apache Arrow (columnar in-memory format), Polars (Rust-based DataFrame library) — these handle batch analytics on a single machine faster than Spark on a cluster for datasets under ~100GB. Don't reach for distributed computing until you've outgrown a single powerful machine.

## Lambda vs Kappa Architecture

### Lambda Architecture

Run two parallel pipelines: a **batch layer** (processes all historical data, produces accurate results with high latency) and a **speed layer** (processes recent data in real-time, produces approximate results with low latency). A serving layer merges results from both.

**The problem**: You maintain the same logic in two different systems (batch engine + stream engine). Bugs must be fixed in both. Results must be reconciled. The complexity is crushing.

### Kappa Architecture

Use a single stream processing pipeline for everything. Historical reprocessing is done by replaying the event log (Kafka) through the stream processor with a new consumer group.

**The simplification**: One codebase, one system, one set of semantics. Reprocessing = replay.

**The limitation**: Not all batch workloads fit the streaming model (training an ML model on a year of data isn't naturally a stream). And full replay of a massive event log can be slow and expensive.

**Practical reality**: Most systems use a hybrid. Real-time aggregations via streaming. Historical analytics and ML training via batch. The "lambda vs kappa" debate matters less than choosing the right tool for each workload.

## Data Storage: Lakes, Warehouses, Lakehouses

| | Data Lake | Data Warehouse | Data Lakehouse |
|---|-----------|---------------|----------------|
| Storage | Object storage (S3) | Proprietary/managed | Object storage + table format |
| Format | Raw files (JSON, CSV, Parquet) | Structured tables | Open table format (Delta Lake, Iceberg, Hudi) |
| Schema | Schema-on-read | Schema-on-write | Schema-on-read with enforcement |
| Governance | Weak (file-level) | Strong (SQL-level) | Improving (table-level ACID) |
| Query performance | Variable | Optimized (columnar, indexed) | Good (with Parquet + metadata) |
| Cost | Low (cheap storage) | High (compute + storage bundled) | Low storage, pay-per-query compute |
| Examples | S3 + Athena | Snowflake, BigQuery, Redshift | Databricks (Delta Lake), Apache Iceberg on Spark |

**The lakehouse convergence**: Open table formats (Delta Lake, Apache Iceberg, Apache Hudi) add ACID transactions, schema evolution, and time travel to data lakes. This gives you warehouse-like governance on cheap object storage. Iceberg is emerging as the dominant open standard.

## ETL vs ELT

**ETL (Extract, Transform, Load)**: Extract data from sources, transform it (clean, join, aggregate) in a processing engine (Spark, custom code), then load it into the warehouse. Traditional approach when warehouse compute was expensive.

**ELT (Extract, Load, Transform)**: Extract data from sources, load it raw into the warehouse/lake, then transform it inside the warehouse using SQL (dbt, Snowflake SQL, BigQuery SQL). Modern approach enabled by cheap warehouse compute. dbt has made this the dominant pattern for analytics engineering.

**The shift**: ELT is winning because (a) warehouse compute is cheap and scalable, (b) SQL is more accessible than Spark/Python for analysts, and (c) transformations in the warehouse are version-controlled and testable via dbt.

## Data Contracts

As data flows between teams (producers → pipelines → consumers), schema drift and quality degradation cause downstream failures. **Data contracts** formalize the agreement between producers and consumers:

- **Schema definition**: Protobuf, Avro, or JSON Schema defining the expected structure.
- **Quality guarantees**: "This column is never null." "This timestamp is always within 24 hours of now." "This field's cardinality is < 1000."
- **SLAs**: "Data arrives within 15 minutes of the event." "99.9% of records pass validation."
- **Ownership**: Clear ownership of each data source, with contact information for schema change notifications.

Data contracts are the data pipeline equivalent of [[API Versioning and Compatibility]] — they prevent producers from silently breaking consumers.

## Trade-Off Analysis

| Processing Model | Latency | Throughput | Complexity | Fault Tolerance | Best For |
|-----------------|---------|-----------|------------|-----------------|----------|
| Batch (MapReduce, Spark batch) | Hours — processes accumulated data | Very high — full cluster utilization | Low — simple input/output model | Excellent — retry entire job or stage | ETL, daily reports, ML training |
| Micro-batch (Spark Streaming) | Seconds to minutes | High | Medium | Good — retry per micro-batch | Near-real-time dashboards, log aggregation |
| Stream (Flink, Kafka Streams) | Milliseconds to seconds | High — continuous processing | High — state management, watermarks | Good — checkpointing, exactly-once | Real-time alerting, fraud detection, CDC |
| Lambda architecture (batch + stream) | Mixed — batch for accuracy, stream for speed | High — dual processing | Very high — maintain two codepaths | Good | Legacy — being replaced by stream-first (Kappa) |
| Kappa architecture (stream-only) | Low — single stream path | High | Medium — reprocessing via topic replay | Good | Modern unified data pipelines |

**Start with batch, add streaming where latency matters**: Batch processing is simpler, cheaper, and more forgiving than streaming. You don't need real-time fraud detection for a daily revenue report. Build the batch pipeline first, identify the specific use cases that need lower latency, and add stream processing only for those. The Kappa architecture dream of "everything is a stream" is elegant but operationally expensive.

## Failure Modes

**Late-arriving data corrupting aggregations**: A batch job runs at midnight, aggregating the day's data. But some records arrive after midnight due to mobile client sync delays or upstream system lag. The daily aggregation is permanently wrong. Solution: reprocessing windows (re-run yesterday's batch today with late data), or use lambda/kappa architecture where the streaming layer handles late arrivals and batch provides corrected totals.

**Pipeline poison pill**: A single malformed record (corrupted JSON, unexpected null, overflow value) crashes the batch job. The entire pipeline fails and doesn't process the remaining 99.99% of valid records. Solution: dead-letter queue for failed records, per-record error handling (skip bad records, log them, continue), and input validation at ingestion.

**Backfill overwhelming downstream systems**: A backfill job reprocesses 6 months of data, writing millions of records to a downstream database. The database, sized for daily incremental load, can't handle the burst. Latency spikes, timeouts cascade, and the production workload is affected. Solution: rate-limit backfill jobs, run them during off-peak hours, use separate write endpoints with lower priority, and coordinate with downstream teams.

**Idempotency failure on job retry**: A batch job partially completes, then fails. On retry, it reprocesses records that were already written, producing duplicates. Revenue reports double-count, or duplicate notifications are sent. Solution: design jobs to be idempotent (UPSERT instead of INSERT, include a job-run-ID for deduplication), or implement checkpointing so retries resume from the last successful offset.

**Schema drift between pipeline stages**: The upstream system adds a column to the source data. The ETL pipeline doesn't expect it and either crashes (strict schema) or silently drops it (permissive schema). Downstream consumers who need the new column don't get it. Solution: schema registry with compatibility checking, schema evolution testing in CI, and explicit schema contracts between pipeline stages.

## Connections

- [[Stream Processing]] — Stream processing is converging with batch (Flink, Spark Structured Streaming)
- [[Object Storage Fundamentals]] — Data lakes are built on object storage
- [[Schema Evolution]] — Schema registries enforce data contracts for event-driven pipelines
- [[Message Queues vs Event Streams]] — Kafka is both the transport and the replay mechanism for Kappa architecture

## Reflection Prompts

1. Your daily ETL pipeline processes 500GB of raw event data into analytics tables. The job takes 6 hours. A business user reports that yesterday's data is wrong — a source system sent duplicate records due to a retry bug. You need to reprocess the last 7 days. How do you design the pipeline so that reprocessing is safe (idempotent), fast, and doesn't interfere with today's scheduled run?

2. A real-time fraud detection system needs to check each transaction against the user's historical spending pattern. The history is computed by a nightly batch job. At 8 AM, the batch from last night's data is complete. At 8:01 AM, a user makes a large purchase. The fraud model uses spending data that's up to 32 hours old (last night's batch cut off at midnight). Is this acceptable? How would you reduce this latency gap without moving to full stream processing?

3. Your data pipeline has 5 stages: ingest → validate → transform → enrich → load. Stage 4 (enrich) calls an external API that rate-limits you to 100 requests/second. Your daily batch has 10 million records. How do you design stage 4 to stay within rate limits while keeping the overall pipeline completion time reasonable?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapters 10–11 cover batch processing (MapReduce) and stream processing
- Jay Kreps, "Questioning the Lambda Architecture" (2014) — the argument for Kappa architecture
- dbt documentation (getdbt.com) — the standard tool for ELT transformations
- Apache Iceberg documentation — the emerging open table format standard