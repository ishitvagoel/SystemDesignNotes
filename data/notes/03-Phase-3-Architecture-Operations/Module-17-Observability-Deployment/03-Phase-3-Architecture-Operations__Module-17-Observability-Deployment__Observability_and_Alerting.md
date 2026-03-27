# Observability and Alerting

## Why This Exists

In a monolith, a stack trace tells you where an error occurred. In a distributed system with 20 services, a request traverses multiple services — a stack trace on one tells you almost nothing. The error might originate three services upstream in a timeout that cascaded. Observability is the ability to understand the internal state of the system from its external outputs, and in distributed systems, it's non-negotiable.

The distinction between **monitoring** and **observability**: Monitoring asks "is this metric above the threshold?" (known-unknowns). Observability asks "why is this user experiencing 5-second latency?" (unknown-unknowns). Monitoring tells you something is wrong. Observability helps you figure out what.


## Mental Model

If your system is a patient, observability is the difference between a heart rate monitor and asking the patient "how do you feel?" **Metrics** are vital signs — heart rate, blood pressure, temperature (request rate, error rate, latency). They tell you something is wrong but not why. **Logs** are the patient's journal — detailed notes about every event. They tell you what happened but are hard to search through. **Traces** are an X-ray — they show the path a single request took through every organ (service), revealing exactly where the blockage is. Good observability gives you all three, correlated: the vital signs alert you, the X-ray localizes the problem, and the journal gives you the details. Dashboards without correlation are just decoration.

## The Three Pillars

### Metrics

Numeric time-series data. Aggregated, low-cardinality, cheap to store and query. The foundation for dashboards and alerting.

**RED method** (for request-driven services): Rate (requests/sec), Errors (error rate), Duration (latency distribution — p50, p95, p99). If you only have three dashboards per service, make them RED. These three metrics tell you if the service is healthy from the user's perspective.

**USE method** (for infrastructure resources): Utilization (% of capacity used), Saturation (queue depth / waiting), Errors (error count). Apply USE to CPU, memory, disk, network. USE tells you if the infrastructure is the bottleneck.

**Why both**: RED answers "is the service meeting its SLO?" USE answers "is the hardware the bottleneck?" A service with degraded RED metrics but healthy USE metrics has an application-level problem (bad query, lock contention). A service with degraded RED and saturated USE has a capacity problem.

**Tools**: Prometheus (pull-based metrics collection, PromQL query language, the Kubernetes standard), Grafana (visualization), Datadog (commercial all-in-one), VictoriaMetrics (Prometheus-compatible, better at scale).

### Structured Logs

Individual event records with rich context. High-cardinality (can include user IDs, request IDs, specific error messages, SQL queries). Essential for debugging specific incidents.

**Why structured**: A log line `ERROR: connection refused` tells you nothing actionable. A structured log entry `{"timestamp": "2024-03-08T14:32:05Z", "level": "error", "service": "order-svc", "trace_id": "abc123", "user_id": "user_456", "error": "connection refused", "downstream": "payment-svc:5432", "retry_count": 3}` tells you exactly what failed, for whom, and in what context.

**The correlation ID discipline**: Include a `trace_id` in every log entry. This single practice transforms distributed debugging. When a user reports an error, find their trace_id (from the error response or the request log), search for it across all services — you get a complete picture of what happened.

**Log aggregation**: Elasticsearch/OpenSearch + Kibana (the ELK/EFK stack), Grafana Loki (log aggregation designed for Kubernetes), Datadog Logs. The choice depends on query patterns: Elasticsearch for full-text search over logs, Loki for label-based filtering (cheaper, simpler).

### Distributed Traces

A trace follows a single request through every service it touches. Each service adds a **span** — a unit of work with a start time, duration, and metadata (HTTP method, status code, database query). Spans are nested to form a tree that shows the request's full journey.

**Why traces matter**: A user reports that the checkout page takes 5 seconds. Metrics show the API service p99 is 100ms. Where are the other 4.9 seconds? A trace shows: API (100ms) → order-service (50ms) → inventory-service (200ms) → payment-service (4500ms, of which 4200ms is waiting for Stripe API). The bottleneck is immediately visible.

**OpenTelemetry** (OTel): The CNCF standard for instrumentation. A vendor-neutral SDK that produces metrics, logs, and traces. Instrument your code once; send data to any backend (Jaeger, Zipkin, Datadog, Honeycomb, Grafana Tempo). Supported in all major languages. OTel is rapidly becoming the only instrumentation SDK you need.

**Trace sampling**: At 10,000 requests/second, storing every trace is prohibitively expensive. Sampling strategies:
- **Head-based sampling**: Decide at the start of the request (e.g., sample 10% randomly). Simple, but you might miss interesting traces (errors, slow requests).
- **Tail-based sampling**: Collect all spans for every request. After the request completes, decide whether to keep the trace based on its characteristics (errored? slow? interesting?). More expensive (buffer all spans briefly) but captures the traces you actually want.
- **Adaptive sampling**: Increase sampling rate for low-traffic endpoints (where every request matters) and decrease for high-traffic endpoints (where 1% gives sufficient coverage).

## eBPF-Powered Observability

**eBPF** (extended Berkeley Packet Filter) runs sandboxed programs in the Linux kernel, enabling **zero-instrumentation observability**: observe TCP connections, HTTP requests, DNS queries, and system calls without modifying application code or adding sidecars.

**Why this is transformative**: Traditional observability requires instrumenting every service (adding OpenTelemetry SDKs) and adding sidecar proxies (Envoy for service mesh telemetry). This takes months of engineering effort across all teams. eBPF provides observability for *everything running on the node* — including legacy services, third-party components, and databases — without touching their code.

**Capabilities**: Map all service-to-service communication (even between uninstrumented services). Measure kernel-level latency (scheduler delay, I/O wait) that application-level instrumentation can't see. Profile CPU usage by function without recompilation.

Meta reported ~20% CPU reduction by replacing sidecar-based telemetry with eBPF-based alternatives — the sidecars themselves were a significant overhead at their scale.

**Tools**: Cilium (eBPF-based networking + observability for Kubernetes), Pixie (automatic observability for Kubernetes — captures HTTP, gRPC, database, and DNS traffic via eBPF), Parca (continuous profiling via eBPF).

## Alerting Philosophy

### Symptom-Based, Not Cause-Based

**Bad alert**: "CPU utilization > 80%." CPU can spike to 90% during a legitimate batch job without any user impact. This alert fires, the on-call engineer investigates, finds nothing wrong, and loses trust in alerts.

**Good alert**: "p99 latency exceeds SLO (200ms) for 5 minutes." This means users are actually experiencing pain. The on-call engineer investigates the *cause* of the latency — which might be CPU, or a slow query, or a downstream dependency.

### Multi-Window Burn-Rate Alerts

Covered in [[SLOs SLIs and Error Budgets]]. The summary: alert based on how fast the error budget is being consumed, not on raw thresholds. Fast burn (14× in 1 hour) = acute incident, alert immediately. Slow burn (3× over 6 hours) = gradual degradation, alert with lower urgency.

### Alert Fatigue Prevention

Every alert must be actionable. If the on-call engineer reads an alert and thinks "I don't know what to do about this" or "this happens every Tuesday and resolves itself" — the alert is bad. It trains engineers to ignore alerts, and the real incident gets buried in noise.

**Rules**: Every alert has a runbook. Alerts that fire > 3 times without human action needed should be automated or silenced. Review alert volume monthly; target < 5 actionable pages per on-call shift.

## Trade-Off Analysis

| Signal Type | Cardinality Handling | Query Flexibility | Storage Cost | Best For |
|------------|---------------------|------------------|-------------|----------|
| Metrics (Prometheus, Datadog) | Aggregated — pre-computed counters | Limited — pre-defined dimensions | Low — compact time series | Dashboards, alerting, SLO tracking |
| Logs (ELK, Loki, CloudWatch) | High — individual events | Flexible — full-text search | High — verbose, per-event storage | Debugging, audit trails, error details |
| Traces (Jaeger, Tempo, Honeycomb) | Very high — per-request spans | Excellent — drill down by any attribute | High — per-request traces | Distributed request tracing, latency analysis |
| Events (structured, high-cardinality) | Very high — Honeycomb-style wide events | Excellent — arbitrary GROUP BY | High | Exploratory debugging, unknown-unknowns |

| Alerting Strategy | Noise Level | Detection Speed | Context | Best For |
|------------------|------------|-----------------|---------|----------|
| Threshold alerts (static) | High — brittle thresholds | Fast | Low | Simple metrics, binary states |
| Anomaly detection (ML-based) | Medium — tuning required | Medium | Low | Seasonal patterns, capacity monitoring |
| SLO-based burn rate alerts | Low — alerts on user impact | Varies by burn rate window | High — tied to error budget | Production services with defined SLOs |

**SLO-based alerting reduces noise by 90%**: Traditional alerting fires on symptoms (CPU > 80%, latency > 500ms). SLO-based alerting fires on impact (error budget burning 10x faster than sustainable). A CPU spike that doesn't affect users → no alert. A subtle latency increase that erodes your error budget → alert. This aligns alerts with what actually matters: user experience.

## Failure Modes

**Cardinality explosion in metrics**: A developer adds a metric label for `user_id`. With 10M users, Prometheus now stores 10M time series for a single metric. Memory usage explodes, query latency spikes, and Prometheus OOM-kills. Solution: never use unbounded labels (user IDs, request IDs, IP addresses) on metrics. Use those dimensions in logs and traces instead. Set cardinality limits on metric ingestion.

**Alert on symptoms, not causes, causing confusion**: An alert fires: "disk usage > 80%." The on-call investigates disk, but the real cause is a logging misconfiguration flooding the disk. The alert symptom (disk) doesn't point to the cause (logging). Solution: layer alerts — symptom alerts page humans, causal alerts add context. Include runbook links that guide investigation from symptom to common causes.

**Distributed trace sampling missing rare errors**: Traces are sampled at 1% to reduce storage cost. A rare error (1 in 10,000 requests) appears in only 0.01% of sampled traces — effectively invisible. Solution: use head-based sampling for volume reduction AND tail-based sampling that captures 100% of error traces. OpenTelemetry's tail-based sampler does this.

**Dashboard cargo culting**: Teams create dashboards by copying templates without understanding the metrics. A "P99 latency" graph shows high latency, but it's measuring total request time including client think-time, not server processing. Nobody questions the dashboard's accuracy. Solution: document what each dashboard metric actually measures, validate dashboards against known scenarios (load test + verify expected metrics), and regularly review dashboards for accuracy.

**Log aggregation lag during incidents**: When an incident occurs, engineers rush to the logging system (ELK, Loki) to investigate. But under the same load spike that caused the incident, log ingestion is lagging. Recent logs aren't available. Engineers are debugging blind. Solution: size log infrastructure for peak load (not average), implement priority ingestion for error-level logs, and maintain a real-time tail capability that bypasses the aggregation pipeline.

## Architecture Diagram

```mermaid
graph TD
    subgraph "Production Fleet (App Instances)"
        S1[Service A] -->|1. Push Spans| OTel[OTel Collector]
        S2[Service B] -->|1. Push Spans| OTel
        S3[Legacy Svc] -.->|2. eBPF Agent| eBPF[eBPF Telemetry]
    end

    subgraph "Observability Pipeline"
        OTel -->|Traces| Tempo[Grafana Tempo / Jaeger]
        OTel -->|Metrics| Prom[Prometheus / VictoriaMetrics]
        OTel -->|Logs| Loki[Grafana Loki / ELK]
        eBPF --> Prom
    end

    subgraph "Action Layer"
        Prom -->|3. Burn Rate| Alert[AlertManager]
        Alert -->|4. Pager| OnCall[SRE Engineer]
        Tempo & Loki & Prom --> Dash[Grafana Unified Dashboard]
    end

    style OTel fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style Dash fill:var(--surface),stroke:var(--accent2),stroke-width:2px;
```

## Back-of-the-Envelope Heuristics

- **Observability Budget**: Allocate **~10% - 20%** of your total infrastructure spend to observability (storage, ingestion, licenses). If it's < 5%, you're likely flying blind; > 30%, you're over-logging.
- **Trace Sampling**: For high-volume services (> 1k RPS), start with **1% head-based sampling**. For errors, use **100% tail-based sampling** to ensure every failure is captured.
- **Log Retention**: Keep structured logs for **7 - 14 days** in hot storage (Elasticsearch) and **1 - 3 years** in cold storage (S3) for compliance and long-term trend analysis.
- **Metric Resolution**: Use **10s - 15s** scraping intervals for critical production metrics. 1-minute intervals are too coarse to catch micro-bursts or rapid flapping.

## Real-World Case Studies

- **Honeycomb (High-Cardinality Events)**: Honeycomb was built by former Facebook engineers who realized that traditional metrics couldn't solve "unknown-unknowns." They pioneered the use of **Wide Events**—a single log entry with 500+ fields (user_id, build_id, browser, region, etc.). This allows them to "group by" any dimension in seconds, identifying that a latency spike is only affecting "Users on Chrome v112 in South Carolina using the Dark Theme."
- **Meta (Scuba)**: Meta uses an internal tool called **Scuba** for real-time monitoring. Scuba ingests millions of events per second and stores them in-memory across thousands of servers. It allows engineers to run arbitrary ad-hoc queries on live traffic data with sub-second response times, which was critical for diagnosing the "Cascading Failure" outages of the mid-2010s.
- **Cloudflare (eBPF for Flow Tracking)**: Cloudflare uses eBPF to track every packet flowing through their network. Instead of traditional sampling (which misses DDoS attacks), eBPF allows them to perform line-rate analysis of billions of packets, identifying malicious patterns at the kernel level and dropping them before they even reach the application layer.

## Connections

- [[SLOs SLIs and Error Budgets]] — SLI measurement is the core observability requirement; burn-rate alerts are the alerting mechanism
- [[Deployment and Release Engineering]] — Canary analysis uses observability data to detect regressions
- [[Incident Management]] — Observability enables rapid detection and diagnosis
- [[Distributed Tracing Deep Dive]] — Deep dive on sampling strategies, OTel collector architecture, and trace storage backends

## Reflection Prompts

1. Your microservice architecture has 30 services. Currently, 10 have OpenTelemetry instrumentation, 20 don't (legacy, third-party, or teams haven't prioritized it). A cross-service latency issue affects users, but traces break at uninstrumented services. What's your strategy — instrument the remaining 20 services (6-month project) or deploy eBPF-based observability (2-week project)? What are the trade-offs?

2. Your on-call engineer received 47 pages last week. 40 were "CPU > 80%" alerts that auto-resolved within 10 minutes. 5 were real incidents. 2 were missed because the engineer had stopped paying attention to alerts. How do you fix this?

## Canonical Sources

- *Observability Engineering* by Charity Majors, Liz Fong-Jones, George Miranda — the comprehensive reference
- *Site Reliability Engineering* (Google SRE book) — monitoring and alerting chapters
- OpenTelemetry documentation (opentelemetry.io) — the instrumentation standard
- Brendan Gregg, *BPF Performance Tools* — the definitive reference on eBPF
- Tom Wilkie, "RED Method" (blog post) — the request-driven metrics framework