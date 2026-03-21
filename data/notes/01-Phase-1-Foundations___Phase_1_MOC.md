# Phase 1: Foundations

*The building blocks every distributed system rests on.*

This phase covers the primitives: how machines communicate, how data is stored and retrieved, how APIs are designed, and how entities are identified. Every concept in Phases 2–4 builds on these foundations.

## Modules

| Module | Focus | Key Question Answered |
|--------|-------|----------------------|
| [[_Module 01 MOC]] | Networking & Communication | How do machines talk to each other? |
| [[_Module 02 MOC]] | API Design & Contracts | How do services define their interfaces? |
| [[_Module 03 MOC]] | Storage Engines & DB Internals | How does data get to and from disk? |
| [[_Module 04 MOC]] | Databases: Selection & Scaling | Which database, and how do you scale it? |
| [[_Module 05 MOC]] | Data Modeling & Schema Evolution | How do you shape data and evolve it safely? |
| [[_Module 06 MOC]] | Caching, Storage & CDN | How do you avoid re-fetching and serve content fast? |
| [[_Module 07 MOC]] | Unique ID Generation & Ordering | How do you name things and order events? |

## After This Phase

You'll understand what happens when a request travels from a user's browser to a database and back — every layer, every trade-off. Phase 2 asks: what happens when there's more than one database?