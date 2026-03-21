# Module 06: Object Storage, Caching & Content Delivery

*Storing blobs, caching aggressively, and serving content at the edge.*

## Why This Module Matters

Databases store structured data. But most of the internet's bytes are unstructured: images, videos, backups, logs, ML model weights, static assets. Object storage is where this data lives. Caching is how you avoid re-fetching it. CDNs are how you serve it close to users. Together, these three technologies determine whether your application feels instant or sluggish — and whether your infrastructure bill is manageable or terrifying.

## Notes in This Module

### Object Storage
- [[Object Storage Fundamentals]]

### Distribution
- [[Consistent Hashing]] — Hash ring algorithm that minimizes key redistribution when cache or storage nodes change. Used by Redis Cluster, Cassandra, DynamoDB, and CDNs — S3-style storage, consistency models, lifecycle policies, tiering, content-addressable storage, and erasure coding

### Caching
- [[Cache Patterns and Strategies]] — Cache-aside, read-through, write-through, write-behind, invalidation strategies, cache stampede, and multi-layer caching
- [[Distributed Caching]] — Redis Cluster, Memcached, consistent hashing for cache sharding

### Content Delivery
- [[CDN Architecture]] — Edge caching, origin shield, cache hierarchy, purge strategies, and modern edge compute

## Prerequisites
- [[_Module 01 MOC]] — Networking (DNS, HTTP caching headers, load balancing)
- [[_Module 04 MOC]] — Databases (understanding when to cache vs when to optimize queries)

## Where This Leads
- [[_Module 14 MOC]] — Search Systems (search indexes can be viewed as a form of specialized cache)
- [[_Module 18 MOC]] — Multi-Tenancy, Geo-Distribution & Cost (CDN and tiering are core cost levers)
- [[_Module 19 MOC]] — AI Inference (KV cache, model weight storage, semantic caching)