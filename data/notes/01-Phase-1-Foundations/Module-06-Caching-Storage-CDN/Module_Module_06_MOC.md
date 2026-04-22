# Module 06: Object Storage, Caching & Content Delivery

*Storing blobs, caching aggressively, and serving content at the edge.*

## Why This Module Matters

Databases store structured data. But most of the internet's bytes are unstructured: images, videos, backups, logs, ML model weights, static assets. Object storage is where this data lives. Caching is how you avoid re-fetching it. CDNs are how you serve it close to users. Together, these three technologies determine whether your application feels instant or sluggish — and whether your infrastructure bill is manageable or terrifying.

## Notes in This Module

### Object Storage
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Object_Storage_Fundamentals]]

### Distribution
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Consistent_Hashing]] — Hash ring algorithm that minimizes key redistribution when cache or storage nodes change. Used by Redis Cluster, Cassandra, DynamoDB, and CDNs — S3-style storage, consistency models, lifecycle policies, tiering, content-addressable storage, and erasure coding

### Caching
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Cache_Patterns_and_Strategies]] — Cache-aside, read-through, write-through, write-behind, invalidation strategies, cache stampede, and multi-layer caching
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__Distributed_Caching]] — Redis Cluster, Memcached, consistent hashing for cache sharding

### Content Delivery
- [[01-Phase-1-Foundations__Module-06-Caching-Storage-CDN__CDN_Architecture]] — Edge caching, origin shield, cache hierarchy, purge strategies, and modern edge compute

## Prerequisites
- [[Module_Module_01_MOC]] — Networking (DNS, HTTP caching headers, load balancing)
- [[Module_Module_04_MOC]] — Databases (understanding when to cache vs when to optimize queries)

## Where This Leads
- [[Module_Module_14_MOC]] — Search Systems (search indexes can be viewed as a form of specialized cache)
- [[Module_Module_18_MOC]] — Multi-Tenancy, Geo-Distribution & Cost (CDN and tiering are core cost levers)
- [[Module_Module_19_MOC]] — AI Inference (KV cache, model weight storage, semantic caching)