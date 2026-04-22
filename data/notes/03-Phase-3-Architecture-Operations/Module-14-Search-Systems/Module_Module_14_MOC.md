# Module 14: Search Systems

*Finding the needle — from inverted indexes to vector embeddings.*

## Why This Module Matters

Search is one of the most common features in production systems, yet it's architecturally distinct from typical CRUD operations. A search query like "cheap flights to Tokyo next month" requires tokenization, relevance scoring, and ranking — none of which a database `SELECT` can do well. And with the rise of AI, vector search (finding semantically similar items by embedding distance) has become equally critical.

This module covers both paradigms: traditional keyword search (inverted indexes, BM25, Elasticsearch) and modern vector search (HNSW, approximate nearest neighbors, hybrid retrieval). Understanding both is essential — most production search systems now combine them.

## Notes in This Module

- [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Full-Text_Search_Architecture]] — Inverted indexes, tokenization pipelines, BM25 ranking, Elasticsearch cluster design, and the operational realities of search at scale
- [[03-Phase-3-Architecture-Operations__Module-14-Search-Systems__Vector_Search_and_Hybrid_Retrieval]] — HNSW indexes, product quantization, embedding models, hybrid keyword+vector search with reciprocal rank fusion, and re-ranking strategies

## Prerequisites
- [[Module_Module_04_MOC]] — Indexing fundamentals (B-trees are to databases what inverted indexes are to search)
- [[Module_Module_06_MOC]] — Caching (search results are heavily cached; understanding cache patterns helps design search layer caching)

## Where This Leads
- [[Module_Module_20_MOC]] — RAG Architecture (vector search is the retrieval layer for retrieval-augmented generation)
- [[Module_Module_19_MOC]] — AI inference (embedding generation for vector search runs on inference infrastructure)
