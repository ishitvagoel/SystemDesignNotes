# Object Storage Fundamentals

## Why This Exists

Not all data belongs in a database. Images, videos, PDFs, backups, log archives, ML model weights, Terraform state files — this unstructured data is often the majority of your storage by volume. Storing a 50MB image as a database blob is technically possible but operationally terrible: it bloats the database, slows backups, and wastes expensive database storage on data that's better served as a flat file.

Object storage is purpose-built for this. It trades the query capabilities of a database for massive scale (exabytes), high durability (11 nines), low cost ($0.023/GB/month for S3 Standard), and simple HTTP-based access. Amazon S3, introduced in 2006, defined the paradigm. Today, S3's API is the de facto standard — GCS, Azure Blob Storage, MinIO, and Cloudflare R2 all implement S3-compatible APIs.

## Mental Model

Object storage is a giant key-value store where the key is a path-like string (`images/users/123/avatar.jpg`) and the value is an opaque blob of bytes (the file content). There are no directories — the `/` in the key is just a character. There are no partial updates — you replace the entire object or nothing. There are no appends — each write creates a complete new version.

Think of it as a warehouse with infinite numbered shelves. You store a box (object) on a shelf at a specific address (key). You can retrieve the box, replace it entirely, or delete it. You can't open the box and modify one item inside — you'd take the whole box, modify it, and put the new box back.

## How It Works

### The S3 Data Model

**Buckets**: Top-level containers. Globally unique name within a cloud provider. A bucket has a region, access policies, and configuration (versioning, lifecycle, encryption).

**Objects**: The actual data. Each object has a key (string, up to 1024 bytes), the data (up to 5TB), and metadata (user-defined key-value pairs + system metadata like content-type, ETag, last-modified).

**Prefixes**: Since there are no real directories, you simulate them with key prefixes. `photos/2024/01/image1.jpg` is an object with the key `photos/2024/01/image1.jpg`. Listing with prefix `photos/2024/01/` returns all objects in that "directory." This is a scan operation — listing large prefixes with millions of objects can be slow.

### Consistency Model

**S3 is strongly consistent (since December 2020).** After a successful PUT, any subsequent GET returns the latest version. After a DELETE, the object is gone for all readers. This was a major change — before 2020, S3 offered only eventual consistency for overwrite PUTs and DELETEs, leading to subtle bugs where a read after write could return stale data.

GCS has been strongly consistent from the start. Azure Blob Storage is strongly consistent.

**What "strongly consistent" means here**: Read-after-write consistency and list-after-write consistency. If you PUT an object and immediately LIST the bucket, the new object appears. This is consistency within a single region — cross-region replication (S3 Cross-Region Replication) is still eventually consistent.

### Multipart Upload

For large objects (>100MB recommended, required >5GB), S3 uses multipart upload:

1. Initiate a multipart upload (get an upload ID)
2. Upload parts in parallel (each 5MB–5GB, up to 10,000 parts)
3. Complete the upload (combine parts into the final object)

Parts can be uploaded in any order and retried independently. If the upload fails, you abort it and the parts are cleaned up (eventually — set a lifecycle rule for cleanup of incomplete multipart uploads or they consume storage indefinitely).

**Why it matters**: Multipart upload enables parallel upload (saturate network bandwidth), resumable uploads (retry failed parts without restarting), and uploads of objects up to 5TB (10,000 parts × 5GB).

### Versioning

When enabled, S3 keeps every version of every object. A PUT doesn't overwrite — it creates a new version. A DELETE doesn't remove — it adds a "delete marker." You can retrieve any historical version by version ID.

**Use cases**: Accidental deletion protection, audit trails, point-in-time recovery for application state stored in S3.

**Cost implication**: Every version consumes storage. A 1GB file updated daily generates 365GB/year of version storage. Pair versioning with lifecycle rules to expire old versions after a retention period.

## Storage Tiering

Object storage providers offer multiple storage classes at different price/access trade-offs:

| Tier | S3 Name | Cost ($/GB/month) | Access Latency | Retrieval Cost | Best For |
|------|---------|-------------------|----------------|----------------|----------|
| Hot | S3 Standard | ~$0.023 | Milliseconds | None | Frequently accessed data |
| Warm | S3 Infrequent Access | ~$0.0125 | Milliseconds | Per-GB retrieval fee | Monthly or quarterly access |
| Cold | S3 Glacier Instant | ~$0.004 | Milliseconds | Higher retrieval fee | Yearly access, compliance archives |
| Archive | S3 Glacier Deep Archive | ~$0.00099 | 12–48 hours | Significant retrieval fee | Regulatory archives, disaster recovery |

**Lifecycle policies**: Automatically transition objects between tiers based on age. "Move to IA after 30 days, Glacier after 90 days, delete after 365 days." This is the primary cost optimization lever for object storage.

**Intelligent-Tiering** (S3): Automatically moves objects between tiers based on access patterns. No retrieval fees but a small monthly monitoring fee per object. Good for unpredictable access patterns.

**The egress cost trap**: Storage is cheap. Retrieval is cheap (or free for hot tier). But **data transfer out** (egress) is expensive — $0.09/GB for S3 to the internet. Serving 10TB/month of images directly from S3 costs ~$900/month in egress alone. This is why CDNs exist — they cache at the edge and reduce origin egress. Cloudflare R2 differentiates by having zero egress fees.

## Advanced Concepts

### Content-Addressable Storage (CAS)

Instead of assigning a path-based key, the object's key is derived from its content (typically a cryptographic hash: SHA-256 of the file). The same file always gets the same key, regardless of who uploads it or when.

**Benefits**: Automatic deduplication (uploading the same file twice hits the same key), immutability (changing the content changes the key, so the original is preserved), integrity verification (retrieve the object, hash it, compare to the key).

**Used by**: Git (objects are content-addressed by SHA-1/SHA-256), Docker image layers, IPFS, many backup systems (Restic, Borg).

### Erasure Coding

How does S3 achieve 99.999999999% (11 nines) durability? Not by storing 11 copies. It uses **erasure coding** — a technique from information theory that splits data into fragments, generates redundancy fragments, and stores them across multiple drives/facilities. Any sufficient subset of fragments can reconstruct the original data.

Example: Split a file into 8 data fragments, generate 4 parity fragments (12 total). Store each on a different drive. Any 8 of the 12 can reconstruct the file. You can lose 4 drives simultaneously without data loss, using only 1.5× storage (vs 3× for triple replication).

**Trade-off vs replication**: Erasure coding uses less storage for the same durability level. But reconstructing data requires computation (reading and decoding multiple fragments), making reads slightly slower and more CPU-intensive than reading from a simple replica. For cold/archive storage, the storage savings dominate. For hot storage, some systems use replication for frequently accessed data and erasure coding for less-accessed data.

### When to Use Object Storage vs Database

| Store in Object Storage | Store in Database |
|------------------------|-------------------|
| Images, videos, audio | Metadata about those files (filename, owner, size, URL) |
| Backups and archives | The data being backed up |
| ML model weights and training data | Model metadata, experiment tracking |
| Log archives | Recent logs (for querying), log indexes |
| Static website assets | Dynamic content |
| Large documents (PDFs, exports) | Document metadata and search indexes |

**The pattern**: Store the blob in object storage, store the metadata (including the object storage URL/key) in the database. The database is your query layer; object storage is your blob layer.

## Trade-Off Analysis

| Storage Type | Latency | Throughput | Cost (per GB/month) | Durability | Best For |
|-------------|---------|-----------|--------------------|-----------|---------| 
| Block storage (EBS, Persistent Disk) | <1ms | High — direct attach | $0.08-0.10 | 99.999% | Databases, OS volumes, low-latency I/O |
| File storage (EFS, Filestore) | 1-10ms | Moderate — shared access | $0.30+ | 99.999% | Shared filesystems, CMS, legacy apps |
| Object storage — standard (S3, GCS) | 50-100ms first byte | Very high — parallel GETs | $0.023 | 99.999999999% (11 nines) | Static assets, backups, data lake, media |
| Object storage — infrequent (S3-IA) | Same | Same | $0.0125 | Same | Backups accessed occasionally |
| Object storage — archive (Glacier, Coldline) | Minutes to hours | Batch retrieval | $0.004 | Same | Compliance archives, disaster recovery |

**Object storage isn't a filesystem**: You can't append to objects, can't do partial updates, and can't list directories efficiently (prefix listing is O(N)). But you get 11 nines of durability, effectively infinite scale, and dirt-cheap storage. The design pattern is: use object storage as the durable backing store, and maintain a metadata index (DynamoDB, PostgreSQL) for fast lookups and listing.

## Failure Modes

- **Runaway storage costs**: No lifecycle policies, versioning enabled, incomplete multipart uploads accumulating. Storage grows linearly with time even if logical data doesn't. Mitigation: lifecycle policies from day one, monitoring of storage growth vs logical data growth.

- **Egress cost shock**: A feature launches that serves images directly from S3. Traffic spikes. The AWS bill arrives with a $50,000 egress charge. Mitigation: always serve public content through a CDN, never directly from the object store.

- **Prefix hotspot (S3)**: S3 partitions data by key prefix internally. If all keys share a prefix (e.g., `logs/2024-03-08/...`) and write throughput is very high (>5,500 PUTs/sec to the same prefix), performance degrades. Mitigation: add randomness or hash to key prefixes to distribute across S3's internal partitions. (S3 has improved automatic partition scaling, but the principle still applies for extreme throughput.)

- **Incomplete multipart upload leak**: A failed upload leaves parts in S3 consuming storage. Without a cleanup lifecycle rule, these parts persist forever. Mitigation: add a lifecycle rule to abort incomplete multipart uploads after 7 days.

## Connections

- [[Cache Patterns and Strategies]] — Object storage responses should be cached aggressively (CDN, browser cache)
- [[CDN Architecture]] — CDNs sit in front of object storage to reduce egress costs and improve latency
- [[Cost Engineering and FinOps]] — Storage tiering and lifecycle policies are primary FinOps levers
- [[Storage Engine Selection]] — Object storage is for blobs; databases are for structured data. Don't conflate them.
- [[Distributed Caching]] — Caching object storage responses in Redis or Memcached for hot objects

## Reflection Prompts

1. Your application stores user-uploaded photos in S3 Standard. Users upload 10,000 photos/day (~5MB each). Photos are viewed frequently in the first week, occasionally for a month, and rarely after that. Design a lifecycle policy. What's the estimated monthly cost at 1 million total photos vs serving everything from S3 Standard?

2. You're designing a backup system for a database with 500GB of data, daily full backups, and 30-day retention. Should you use database-native backup (pg_dump) stored in S3, or continuous WAL archiving to S3? What are the trade-offs in recovery time, storage cost, and recovery granularity?

## Canonical Sources

- AWS S3 documentation — the de facto reference for object storage concepts, since S3's API is the industry standard
- *Designing Data-Intensive Applications* by Martin Kleppmann — Chapter 3 briefly covers when to use blob storage vs structured storage
- Werner Vogels, "The Frugal Architect" laws — storage tiering and egress optimization are core frugal architecture practices
- Cloudflare Blog, "Introducing R2" — explains the egress cost problem and how R2 addresses it