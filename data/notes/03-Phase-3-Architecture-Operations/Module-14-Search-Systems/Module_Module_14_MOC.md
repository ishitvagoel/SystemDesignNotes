# Module 14: Search Systems

*Finding the needle — from inverted indexes to vector embeddings.*

## Why This Module Matters

Search is one of the most common features in production systems, yet it's architecturally distinct from typical CRUD operations. A search query like "cheap flights to Tokyo next month" requires tokenization, relevance scoring, and ranking — none of which a database `SELECT` can do well. And with the rise of AI, vector search (finding semantically similar items by embedding distance) has become equally critical.

This module covers both paradigms: traditional keyword search (inverted indexes, BM25, Elasticsearch) and modern vector search (HNSW, approximate nearest neighbors, hybrid retrieval). Understanding both is essential — most production search systems now combine them.

## Notes in This Module

- [[Full-Text Search Architecture]] — Inverted indexes, tokenization pipelines, BM25 ranking, Elasticsearch cluster design, and the operational realities of search at scale
- [[Vector Search and Hybrid Retrieval]] — HNSW indexes, product quantization, embedding models, hybrid keyword+vector search with reciprocal rank fusion, and re-ranking strategies

## Prerequisites
- [[_Module 04 MOC]] — Indexing fundamentals (B-trees are to databases what inverted indexes are to search)
- [[_Module 06 MOC]] — Caching (search results are heavily cached; understanding cache patterns helps design search layer caching)

## Where This Leads
- [[_Module 20 MOC]] — RAG Architecture (vector search is the retrieval layer for retrieval-augmented generation)
- [[_Module 19 MOC]] — AI inference (embedding generation for vector search runs on inference infrastructure)
