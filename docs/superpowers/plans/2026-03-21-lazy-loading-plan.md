# Lazy-Loaded Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve load time by splitting the 1.1MB monolithic JSON into individual, lazy-loaded markdown files and a dedicated search index.

**Architecture:** Create Node.js scripts to extract content into `data/notes/*.md` and `data/search-index.json`. Refactor the frontend to fetch content dynamically and use the new search index.

**Tech Stack:** Node.js (for scripts), Vanilla JS (Frontend).

---

### Task 1: Content Extraction Script

**Files:**
- Create: `scripts/extract-notes.js`

- [ ] **Step 1: Write Extraction Logic**
Create a script that reads `data/vault-content.json`. For each key (note ID), write the value to `data/notes/${id}.md`.

- [ ] **Step 2: Write Search Index Logic**
In the same script, create an array of objects `{ id, text }` where `text` is the raw markdown converted to lowercase and stripped of special characters to minimize size. Save this to `data/search-index.json`.

- [ ] **Step 3: Execute Script**
Run `node scripts/extract-notes.js` and verify `data/notes/` is populated.

- [ ] **Step 4: Commit**
```bash
git add scripts/extract-notes.js data/notes/ data/search-index.json
git commit -m "chore: extract monolithic json into individual markdown files"
```

---

### Task 2: Frontend Refactor (Lazy Loading)

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Update `init` function**
Remove the fetch for `vault-content.json`. Load only `vault-index.json` initially. Start a background fetch for `data/search-index.json`.

- [ ] **Step 2: Update `openNote` function**
Make `openNote` `async`. Check if the content is already in the `openTabs` cache. If not, `await fetch('data/notes/${id}.md')` before calling `renderNote`.

- [ ] **Step 3: Update `renderNote` and `buildOutline`**
Ensure these functions handle the asynchronously fetched content rather than reading from a global `VAULT_CONTENT` object.

- [ ] **Step 4: Update `doSearch`**
Modify the search loop to iterate over the new background-loaded `searchIndex` instead of `VAULT_CONTENT`.

- [ ] **Step 5: Commit**
```bash
git add js/app.js
git commit -m "feat: implement lazy loading for notes and async search index"
```

---

### Task 3: Feature Compatibility & Cleanup

**Files:**
- Modify: `js/app.js` (Export and Graph features)
- Delete: `data/vault-content.json`

- [ ] **Step 1: Fix Obsidian Export**
Update the export function to fetch all files in `VAULT_INDEX` sequentially or in batches before generating the zip, instead of relying on the global content object.

- [ ] **Step 2: Fix Graph View**
The graph view currently relies on parsing all content for `[[links]]`. Update it to either:
A) Use the background `searchIndex` if we include links in it.
B) Pre-compute the edge list during the Node.js build step (Task 1) and save it as `data/graph-edges.json`. **(Recommended)**

- [ ] **Step 3: Delete Monolith**
Remove `data/vault-content.json`.

- [ ] **Step 4: Commit**
```bash
git rm data/vault-content.json
git add js/app.js data/graph-edges.json
git commit -m "refactor: fix export/graph for lazy loading and remove monolithic data"
```
