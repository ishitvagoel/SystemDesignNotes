# System Design Vault - TODO

## Current State Context (For AI Agent)
- We recently completed a major architecture refactor: moved from a monolithic JSON file to lazy-loaded individual Markdown files stored in `data/notes/`.
- We added an interactive D3.js Canvas Playground, a Learning Suite (Scale Slider & Scenarios), and enhanced the Notes UI (TOC, Light/Dark mode).
- We successfully established a new "Senior Engineer" standard for note quality by enriching three foundational notes (`Distributed Caching`, `Event-Driven Architecture Patterns`, `SQL vs NoSQL Decision Framework`).

## Remaining Tasks

### 1. Batch Enrichment of Remaining Notes
**Goal:** Apply the "Senior Engineer" standard to the remaining ~120 Markdown notes in `data/notes/` without altering their original core content.

**Status:** [x] All 123 notes enriched with Architecture Diagrams, Heuristics, and Case Studies. Verified Mermaid rendering fixes and theme-aware initialization.

### 2. Canvas Playground Polish
**Goal:** Enhance the newly added interactive canvas features.
- [x] Add more branching scenarios to `data/scenarios.json`.
- [x] Implement a true "Split-View" comparator for side-by-side architectural analysis (Design A vs. Design B).

### 3. Build & CI Pipeline
**Goal:** Automate the data generation steps.
- [x] Created `scripts/rebuild-data.js` to ensure `data/search-index.json`, `data/graph-edges.json`, and `data/study-prompts.json` are automatically regenerated. Verified via manual execution.

---
**Next Session Instructions:**
When starting a new session, ask the AI agent to read this `TODO.md` file and choose a task to begin executing.
