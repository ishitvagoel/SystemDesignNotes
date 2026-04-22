# Stream Processing

## Why This Exists

Batch processing answers yesterday's questions today. Stream processing answers today's questions now. Fraud detection within seconds of a transaction. Real-time dashboards showing current system state. Dynamic pricing that responds to demand in real time. Anomaly detection that alerts before a problem cascades.

But stream processing introduces challenges that batch processing avoids. Events arrive out of order (a mobile device sends events minutes late). Events arrive late (a network partition delays delivery). The stream is unbounded — it never ends, so you can't "wait for all the data." These realities require explicit mechanisms: windows, watermarks, and late-data handling.


## Mental Model

Standing at a riverbank with a net. Batch processing waits for the river to freeze, then walks across the ice and picks up all the fish. Stream processing stands at the bank and catches fish as they swim by — one at a time, in real time. The net has some challenges: you need to decide how long to hold it in the water before counting your catch (windowing), you need to handle fish that swim slower and arrive after you've already counted (late arrivals and watermarks), and if you drop the net and pick it up again, you need to avoid counting the same fish twice (exactly-once processing). The harder part isn't catching a fish — it's maintaining an accurate running count of all fish you've ever caught, even when the current is unpredictable.

## Core Concepts

### Windows

Since streams are unbounded, computations must be scoped to finite time intervals — windows.

**Tumbling windows**: Fixed-size, non-overlapping intervals. "Count events per minute" creates windows [0:00–0:01), [0:01–0:02), etc. Each event belongs to exactly one window. Simple and efficient. Best for: periodic aggregations (per-minute counts, hourly summaries).

**Sliding windows**: Fixed-size, overlapping. "Count events in the last 5 minutes, updated every 30 seconds." A single event belongs to multiple windows (up to `window_size / slide_interval` windows). More compute-intensive but provides continuous, smoothed metrics. Best for: moving averages, trend detection.

**Session windows**: Variable-size, defined by inactivity gaps. "Group all events from a user until there's a 30-minute gap." Window boundaries depend on the data — two rapid-fire events are in the same session; two events 45 minutes apart start new sessions. Best for: user session analytics, clickstream analysis.

**Global window**: No windowing — the computation spans all time. Requires a custom trigger to emit results (e.g., "emit every 1000 events" or "emit every 5 minutes"). Used for running totals, lifetime counters.

### Event Time vs Processing Time

This distinction is the conceptual leap that makes stream processing hard:

**Event time**: When the event actually occurred (timestamp embedded in the event). "This purchase happened at 14:32:05 UTC."

**Processing time**: When the stream processor receives the event. "I processed this purchase at 14:32:08 UTC."

These differ because of network delays, buffering, retransmission, and offline devices. A mobile app might generate an event at 14:32 but not send it until 14:35 (3 minutes late — network outage). If you window by processing time, the event lands in the wrong window. If you window by event time, you get correct results — but you need to handle the lateness.

**Why event time matters**: In processing time, a traffic spike during a Kafka consumer lag looks like a burst of events. In event time, the events are spread over the actual time they occurred. Event-time processing gives correct results; processing-time is easier but wrong under lateness.

### Watermarks

A watermark is the processor's estimate of "how far along in event time have we progressed?" A watermark at T=14:30 means: "I believe I have received all events with event time ≤ 14:30."

**How watermarks drive computation**: When the watermark advances past a window's end time, the window is closed and its result is emitted. Events arriving after the watermark (late events) are handled separately.

**The watermark trade-off**: 
- **Conservative watermarks** (wait longer before advancing): More accurate results (fewer missed late events) but higher latency (results are delayed while waiting).
- **Aggressive watermarks** (advance quickly): Lower latency but more late events arrive after the window closes.

**Handling late data** (events that arrive after the watermark):
- **Drop**: Ignore late events. Simplest, but loses data. Acceptable when a few missed events don't affect the result (dashboards with millions of events).
- **Side output**: Route late events to a separate stream for special handling (correction pipeline, human review).
- **Window re-firing**: Reopen the window, incorporate the late event, and emit an updated result. Correct but adds complexity (downstream consumers must handle updates to previously-emitted results).
- **Allowed lateness**: Configure a grace period after the watermark. "Accept events up to 5 minutes late." Windows stay open during the grace period, then close permanently.

### Exactly-Once Semantics

Stream processors can fail mid-computation. On restart, they must not double-count events or lose events.

**Checkpointing** (Flink's approach): Periodically snapshot the processor's entire state (window contents, aggregation values, operator state) AND the input stream position (Kafka offsets). On failure, restore from the last checkpoint and replay from the corresponding offset. Events between the checkpoint and the failure are reprocessed, but because the state is also restored, the reprocessing produces the same output — no double-counting.

Flink's checkpointing is based on the Chandy-Lamport distributed snapshot algorithm: checkpoint barriers flow through the dataflow graph, and each operator snapshots its state when it sees the barrier. This happens asynchronously — normal processing isn't paused.

**Transactional produces** (Kafka Streams): Tie consumption, processing, and production into a single Kafka transaction. If the processor fails, the transaction is rolled back — both the consumed offsets and the produced output messages are rolled back atomically.

**The limitation**: Exactly-once applies to the stream processing topology. If the processor writes to an external system (database, API), exactly-once doesn't extend there — you need [[02-Phase-2-Distribution__Module-10-Distributed-Transactions__Idempotent_Consumers]] at the external system boundary.

## Stream Processing Engines

| Engine | Model | Strengths | Best For |
|--------|-------|-----------|----------|
| **Apache Flink** | True streaming (event-at-a-time) | Strongest exactly-once semantics, best event-time support, SQL interface, sophisticated state management | Complex event processing, event-time windowing, stateful stream processing |
| **Kafka Streams** | Library (no separate cluster) | Embedded in your JVM application, tight Kafka integration, no infrastructure overhead | Simple transformations, enrichment, routing — apps that already use Kafka |
| **Spark Structured Streaming** | Micro-batch (simulates streaming) | Unified batch + stream API, large ecosystem, familiar for Spark users | Organizations already using Spark, HTAP workloads |
| **Amazon Kinesis Data Analytics** | Managed Flink | Zero ops, auto-scaling, integrated with AWS services | AWS-native workloads |
| **Apache Beam** | Abstraction layer | Write once, run on Flink/Spark/Dataflow | Multi-engine portability |

**Practical guidance**: Flink for complex stateful processing with strong correctness requirements. Kafka Streams for simpler transformations in a Kafka-centric architecture (no separate cluster to manage). Spark Structured Streaming if you're already invested in Spark.

## Trade-Off Analysis

| Framework | Latency | State Management | Exactly-Once | Deployment Model | Best For |
|-----------|---------|-----------------|-------------|-----------------|----------|
| Apache Flink | Very low (true streaming) | Excellent — managed state, checkpoints | Yes — with Kafka | Standalone cluster or K8s | Complex stateful stream processing, CEP |
| Kafka Streams | Low | Good — local state backed by changelog topics | Yes — within Kafka | Library (runs in your app) | Kafka-native processing, simple topologies |
| Spark Structured Streaming | Seconds (micro-batch) | Good — built on Spark state store | Yes — with idempotent sinks | Spark cluster | Teams already using Spark for batch + stream |
| Apache Beam (Dataflow) | Varies by runner | Runner-dependent | Runner-dependent | Portable — multiple runners | Multi-cloud, unified batch+stream API |
| AWS Kinesis Data Analytics | Low | Managed — Flink under the hood | Yes | Fully managed | AWS-native, low operational overhead |

**Kafka Streams vs Flink is the real decision**: For most teams, the choice is between Kafka Streams (lightweight library, no cluster to manage, perfect for Kafka-native pipelines) and Flink (full framework, complex but powerful, best for stateful processing with exactly-once guarantees across sources). If your data is already in Kafka and your processing is simple (filter, map, aggregate), Kafka Streams is the pragmatic choice. If you need windowed joins, complex event processing, or processing from multiple sources, use Flink.

## Failure Modes

- **Checkpoint size explosion**: State grows unboundedly (e.g., a window that never closes, a table join with no TTL). Checkpoints become massive, slow, and eventually fail. Mitigation: bound state with TTLs, use windowed operations instead of unbounded state, monitor state size.

- **Watermark stalls**: A single slow partition (or a partition with no events) prevents the watermark from advancing. All downstream windows wait. Mitigation: use per-partition watermarks with a global minimum, or advance the watermark heuristically when a partition is idle.

- **Backpressure cascading**: A slow operator in the pipeline backs up the entire dataflow. Upstream operators buffer, consume memory, and eventually fail. Mitigation: Flink's credit-based flow control manages backpressure natively. Monitor operator utilization and scale slow operators.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Event Sources"
        App[App Events] --> Kafka[(Kafka Topic)]
        IoT[IoT Sensors] --> Kinesis[(Kinesis)]
    end

    subgraph "Stream Processor (Flink/Spark)"
        Kafka & Kinesis --> Ingest[Source Connector]
        Ingest --> Window[Windowing: Tumbling/Sliding]
        Window --> Logic[Stateful Logic: Aggregate/Join]
        Logic --> Checkpoint[State Checkpoint: RocksDB/S3]
    end

    subgraph "Real-Time Sinks"
        Logic --> Dash[Grafana Dashboard]
        Logic --> Alert[Fraud Alert Engine]
        Logic --> DB[(OLAP DB: ClickHouse)]
    end

    style Window fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Checkpoint fill:var(--surface),stroke:var(--border),stroke-dasharray: 5 5;
```

## Back-of-the-Envelope Heuristics

- **End-to-End Latency**: True streaming (Flink) typically achieves **50ms - 200ms**. Micro-batching (Spark) is typically **1s - 5s**.
- **Window State Size**: For 1 million active users and a 1-hour sliding window (updated every 1 min), you are maintaining **~60 concurrent window states** per user. If each state is 100 bytes, that's **~6GB of state** in RAM/RocksDB.
- **Watermark Delay**: A common default is **1 - 5 seconds**. This is the amount of time the system "waits" for late data before closing a window.
- **Throughput**: A single Flink TaskManager can often process **~10k - 50k events/sec** per CPU core, depending on state complexity.

## Real-World Case Studies

- **Uber (Apache Flink for Marketplace)**: Uber uses Flink to power its real-time "Marketplace" logic, including dynamic surge pricing and driver-rider matching. They process billions of events per day with millisecond latency, ensuring that price changes respond to a sudden rainstorm or a stadium clearing out almost instantly.
- **Netflix (Keystone Pipeline)**: Netflix built the Keystone pipeline to handle all of its event data. It uses **Apache Flink** for real-time stream processing, allowing them to detect playback issues or anomalies in their global CDN in seconds, rather than waiting for hourly batch jobs.
- **LinkedIn (Samza/Kafka Streams)**: LinkedIn, where Kafka was born, uses stream processing for features like "Who viewed your profile" and real-time job recommendations. They pioneered many stateful streaming concepts, using local state stores (like RocksDB) inside their stream processors to handle high-cardinality joins (e.g., joining a click event with user profile metadata) without hitting a central database.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Message_Queues_vs_Event_Streams]] — Kafka is the standard input/output for stream processing
- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Batch_Processing_and_Data_Pipelines]] — Flink and Spark unify batch + stream; the batch/stream boundary is dissolving
- [[03-Phase-3-Architecture-Operations__Module-13-Messaging-Pipelines__Event-Driven_Architecture_Patterns]] — Stream processing consumes events from EDA

## Reflection Prompts

1. You're building a real-time fraud detection system. A transaction event must be evaluated against the user's transaction history (last 24 hours). If the current transaction's amount exceeds 3× the user's rolling average, flag it. How do you implement this with windowing? What happens when a user's historical events arrive late?

2. Your Flink job aggregates click events per product per minute. During a 20-minute Kafka partition lag (caused by a broker failure), 20 minutes of events arrive all at once when the broker recovers. What happens to your windows? Is the output correct? How do watermarks handle this scenario?

## Canonical Sources

- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 11: "Stream Processing" covers windows, event time, and exactly-once semantics
- Tyler Akidau, "The World Beyond Batch: Streaming 101 and 102" (O'Reilly blog posts) — the definitive introduction to watermarks, windowing, and event-time processing
- Apache Flink documentation — the most comprehensive reference for stream processing concepts and APIs
- Chandy & Lamport, "Distributed Snapshots: Determining Global States of Distributed Systems" (1985) — the theoretical basis for Flink's checkpointing