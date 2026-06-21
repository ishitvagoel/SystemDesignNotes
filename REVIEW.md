# Content Correctness Review — June 2026

A full technical-correctness review of all 151 notes in `data/notes/`, performed on branch
`claude/content-review-rmduu2`. Every note was read in full and its factual claims checked:
arithmetic, protocol/algorithm mechanics, named-system facts, citations, and internal consistency.

**Result: 80 corrections across ~60 files.** Core theory (consensus, quorum math, CRDT properties,
capacity estimation) was largely sound; errors clustered in quantitative claims, named-system
attributions, and a few conceptual mislabels.

## Corrections by category

### Arithmetic / quantitative (often off by 10–1000×)
- URL shortener collision probability: ~0.0002% → ~0.17% (6B codes / 3.5T space)
- FinOps unit-economics example: $0.10/req at 1K req/day is ~$3,000/month (was "$3/month"), ~$3M/month at 1M req/day
- AWS Macie: ~$1/GB scanned (was "1TB for ~$1")
- Audit-log hot storage: $9K–27K/month for 90-day retention at 1TB/day (was $3K–9K)
- A/B-test MDE: ~14,000 users/variant for 0.5pp uplift on 2% baseline (was ~60,000)
- B-tree depth: fan-out 500 at 4 levels ≈ 62B keys (was 250B); billion-row index ≈ 4 levels (was 30)
- 2PC blocking: 0.5% of 100 TPS ≈ one blocked txn every 2 seconds (was 20)
- Burn rate 14.4×: budget exhausted in ~50h (720/14.4), not 48h
- Tail-sampling buffer: 2M spans/s × 30s × 500B ≈ 30 GB (was 1 GB); Tempo S3 cost is $131/month (was /week)
- Prompt-caching ROI recomputed with cache hits billed at ~10%
- News-feed "100×" section used 10× numbers (reads, cache size, fan-out all corrected)
- Feature-flag NFR reconciled with its own downstream math (50K req/s ≈ 250K evals/s)

### Conceptual / mechanism
- Quorum labels swapped: W=3,R=1 is the *read*-heavy optimization, W=1,R=3 *write*-heavy
- FLP rules out guaranteed termination even with unbounded time (was "bounded time")
- OAuth2 is authorization (the visa), OIDC the identity layer (the passport)
- CDC outbox gives atomic capture + at-least-once delivery, not "exactly-once"; RabbitMQ delivers to exactly one consumer, doesn't "process exactly once"
- Async replication loses committed-but-unreplicated writes, not "uncommitted" ones
- LWW clock-skew example made internally consistent (fast clock now stamps the higher timestamp)
- Cassandra: only `ANY` accepts hint-only (sloppy) writes; `ONE` needs a true replica ack
- Cassandra QUORUM is PC/EC, not PC/EL; PACELC PC/EL example is PNUTS, not DynamoDB
- 2PC provides atomic commit, not serializable isolation (that comes from participants' locking)
- Session Guarantees note: "Consistent Prefix (Writes Follow Reads)" section rewritten — it defined
  DDIA's consistent-prefix-reads under Terry et al.'s writes-follow-reads name; now defines WFR
  correctly and distinguishes the two
- Postgres: `autovacuum_analyze_scale_factor` default is 0.1; recovery time is bounded via
  `checkpoint_timeout`/`max_wal_size` (not `recovery_target_timeline`/`checkpoint_completion_target`);
  `effective_io_concurrency` governs bitmap heap scans, not sequential scans; OS page cache does not
  survive OS reboots
- InnoDB: redo+binlog consistency is internal two-phase commit (not "double-write buffering");
  transaction IDs are 48-bit
- DynamoDB (the AWS service) is not leaderless — only the original Dynamo design was
- etcd linearizable reads use ReadIndex; CockroachDB ranges default to 512MB (64MB originally)
- Figma multiplayer is CRDT-inspired but server-authoritative, not true CRDTs (two notes)
- LMDB is copy-on-write with page reuse, not grow-forever append-only; TimescaleDB is B-tree-based,
  not LSM; AWS Lambda 1 vCPU at 1,769 MB; Kubernetes releases 3×/year; KRaft production-ready late
  2022; vLLM released June 2023

### Attributions, citations, and case studies
- Removed fabricated/unverifiable references: Vogels "Life is Not Fair: The Economics of
  Geo-Distribution" (re:Invent 2023), Apple "swift-dp-synthetic-data", `pg_migrator` as an
  engine-migration tool
- "Stack Overflow migrated from Cassandra" — no such migration; Bitly uses 301s (not 302s) and
  ~10B+ clicks/month (not 25B); "Slack built SolrCloud" → SolrCloud is Apache Solr's distributed mode
- Yjs is by Kevin Jahns (not "Martin Kluge"); xi-editor by Raph Levien (not Joseph Gentle);
  Temporal was founded by Cadence's authors (not "the community"); Spotify "Discover Weekly"
- Zanzibar: millions of checks/sec over trillions of ACLs (not "trillions of checks/sec");
  SpiceDB is developed by AuthZed
- Cloudflare 2020 etcd outage: partially failed network switch per the published post-mortem
  (not disk latency); GitHub Oct 2018 split-brain took ~24h to recover (not "seconds")
- Bezos one-way/two-way doors: 2015 shareholder letter (not the "two-pizza memo");
  Vogels "Eventually Consistent": ACM Queue 2008 / CACM 2009
- Study plan is 24 weeks (heading said 22); filled in the empty "Three Fundamental Distributed
  Systems Questions" section

### Legal / compliance (Module 23)
- GDPR erasure: one month, extendable by two further months (Art. 12(3)) — not a hard "30 days"
- GDPR scope is presence-based (Art. 3), not residency/citizenship; the "German citizen traveling
  in the US" example corrected
- DPO mandatory only for certain controllers (Art. 37)
- HIPAA's 6-year retention covers compliance documentation, not PHI (record retention is state law);
  fine caps are inflation-adjusted (~$2M/category/year)

## Known items left as-is (by design)
- **Time-sensitive prices** (LLM per-token tables, AWS rates): correct as of mid-2026; key tables
  now carry "as of" annotations
- **Unverifiable vendor anecdotes**: Uber "Queryguard", Discord 15M concurrent WebSockets, Intuit
  $500M cloud spend, Brex/LinkedIn/Klarna/Stripe specifics, Netflix Fenzo details, the
  "MacNicol & Loftesnes, Resume-Driven Development" citation — plausible but unconfirmed
- **Harmless simplifications**: Raft "term expires" phrasing, single-node SERIALIZABLE ≈
  linearizable, XID wraparound "~4B" (usable horizon ~2B), dated CQL `USING CONSISTENCY` example,
  SOC 2 "1-year retention" (common practice, not mandated), Spanner "stronger than linearizability"
  phrasing
