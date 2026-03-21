# Design Spec: Lazy-Loaded Content Architecture

## Goal
Improve initial load time, memory usage, and maintainability by splitting the monolithic 1.1MB `vault-content.json` into individual, lazy-loaded `.md` files.

## Architecture
- **Index:** `data/vault-index.json` remains as the lightweight registry of all notes (titles, IDs, metadata).
- **Content:** The `data/vault-content.json` file is removed. Its contents are extracted into individual files in a new `data/notes/` directory. Each file is named using the note's `id` (e.g., `data/notes/03-Phase-3..._Full-Text_Search.md`).
- **Fetch Strategy:** The `init()` function only loads the index. When a user clicks a note, `app.js` fetches the specific markdown file asynchronously before rendering.
- **Search Strategy:**
  - *Option A (Client-Side Index):* Pre-compute a lightweight search index (e.g., inverted index using Lunr.js or a custom JSON mapping words to note IDs) during a build step.
  - *Option B (Chunked Search):* Split the content into phase-level chunks (`data/search/phase-1.json`) and load them in the background.
  - *Selected Approach:* Create a `data/search-index.json` that contains stripped-down text (no markdown, lowercase) specifically optimized for search, loaded in the background after the initial render.

## Transition Plan
1. **Extraction Script:** Write a Node.js script to parse `vault-content.json` and generate the individual `.md` files in `data/notes/`.
2. **Search Index Generator:** Write a script to generate a highly compressed `data/search-index.json` for client-side search.
3. **Frontend Refactor:** Update `js/app.js` to fetch individual notes on demand (`openNote`) and use the new search index.
4. **Cleanup:** Delete the monolithic `vault-content.json`.
