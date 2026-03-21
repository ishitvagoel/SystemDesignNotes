# System Design Vault - TODO

## Current State Context (For AI Agent)
- We recently completed a major architecture refactor: moved from a monolithic JSON file to lazy-loaded individual Markdown files stored in `data/notes/`.
- We added an interactive D3.js Canvas Playground, a Learning Suite (Scale Slider & Scenarios), and enhanced the Notes UI (TOC, Light/Dark mode).
- We successfully established a new "Senior Engineer" standard for note quality by enriching three foundational notes (`Distributed Caching`, `Event-Driven Architecture Patterns`, `SQL vs NoSQL Decision Framework`).

## Remaining Tasks

### 1. Batch Enrichment of Remaining Notes
**Goal:** Apply the "Senior Engineer" standard to the remaining ~120 Markdown notes in `data/notes/` without altering their original core content.

**Action Required:**
- Write an automated script (Node.js/Python) that utilizes an LLM API to process the remaining notes.
- For each note, the script should analyze the content and **append** the following sections just above the `## Connections` header:
  - `## Architecture Diagram` (Mermaid.js sequence or flow diagram)
  - `## Back-of-the-Envelope Heuristics` (Concrete numbers, latencies, capacities)
  - `## Real-World Case Studies` (How tech giants use the pattern)
- The script should save the enriched content back to `data/notes/`.

### 2. Canvas Playground Polish
**Goal:** Enhance the newly added interactive canvas features.
- Add more branching scenarios to `data/scenarios.json`.
- Implement a true "Split-View" comparator for side-by-side architectural analysis (Design A vs. Design B).

### 3. Build & CI Pipeline (Optional)
**Goal:** Automate the data generation steps.
- Create a GitHub Action or build script that ensures `data/search-index.json`, `data/graph-edges.json`, and `data/study-prompts.json` are automatically regenerated if any `.md` file in `data/notes/` is modified.

---
**Next Session Instructions:**
When starting a new session, ask the AI agent to read this `TODO.md` file and choose a task to begin executing.
