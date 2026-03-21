# Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the System Design Vault with three new modules: Cloud-Native/Serverless, FinOps, and Data Privacy.

**Architecture:** Create new Markdown notes based on `00-Meta__Note_Template.md`, update metadata, and rebuild the vault index.

**Tech Stack:** Markdown, JSON, Node.js.

---

### Task 1: Create M22: Cloud-Native & Serverless

**Files:**
- Create: `data/notes/03-Phase-3-Architecture-Operations__Module-22-Cloud-Native-Serverless.md`

- [ ] **Step 1: Write the note content**
Use the focus areas from the design doc: FaaS vs K8s, Cold Starts, Event-driven serverless, Serverless DBs.

- [ ] **Step 2: Verify file existence**
Run: `ls data/notes/03-Phase-3-Architecture-Operations__Module-22-Cloud-Native-Serverless.md`

- [ ] **Step 3: Commit**
```bash
git add data/notes/03-Phase-3-Architecture-Operations__Module-22-Cloud-Native-Serverless.md
git commit -m "feat: add M22 Cloud-Native & Serverless module"
```

### Task 2: Create M23: FinOps & Cost Engineering

**Files:**
- Create: `data/notes/03-Phase-3-Architecture-Operations__Module-23-FinOps-Cost-Engineering.md`

- [ ] **Step 1: Write the note content**
Use the focus areas from the design doc: Cloud Bill, Egress costs, Spot Instances, Storage Tiers.

- [ ] **Step 2: Verify file existence**
Run: `ls data/notes/03-Phase-3-Architecture-Operations__Module-23-FinOps-Cost-Engineering.md`

- [ ] **Step 3: Commit**
```bash
git add data/notes/03-Phase-3-Architecture-Operations__Module-23-FinOps-Cost-Engineering.md
git commit -m "feat: add M23 FinOps & Cost Engineering module"
```

### Task 3: Create M24: Data Privacy & Compliance

**Files:**
- Create: `data/notes/03-Phase-3-Architecture-Operations__Module-24-Data-Privacy-Compliance.md`

- [ ] **Step 1: Write the note content**
Use the focus areas from the design doc: GDPR/HIPAA, Data Residency, PII Masking, Right to be Forgotten.

- [ ] **Step 2: Verify file existence**
Run: `ls data/notes/03-Phase-3-Architecture-Operations__Module-24-Data-Privacy-Compliance.md`

- [ ] **Step 3: Commit**
```bash
git add data/notes/03-Phase-3-Architecture-Operations__Module-24-Data-Privacy-Compliance.md
git commit -m "feat: add M24 Data Privacy & Compliance module"
```

### Task 4: Update Study Plan

**Files:**
- Modify: `data/notes/00-Meta__How_to_Study_This_Vault.md`

- [ ] **Step 1: Update the Phase 3 table**
Extend Phase 3 and insert new modules as per design doc.

- [ ] **Step 2: Commit**
```bash
git add data/notes/00-Meta__How_to_Study_This_Vault.md
git commit -m "docs: update 20-week study plan with new modules"
```

### Task 5: Update Quests & Scenarios

**Files:**
- Modify: `data/quests.json`
- Modify: `data/scenarios.json`

- [ ] **Step 1: Add new quests q6 and q7 to `quests.json`**
- [ ] **Step 2: Add new scenarios to `scenarios.json`**
- [ ] **Step 3: Commit**
```bash
git add data/quests.json data/scenarios.json
git commit -m "feat: add new quests and scenarios for expansion modules"
```

### Task 6: Rebuild Data Indexes

**Files:**
- Modify: `data/vault-index.json` (add new entries)
- Run: `node scripts/rebuild-data.js`

- [ ] **Step 1: Add M22, M23, M24 to `data/vault-index.json`**
- [ ] **Step 2: Run the rebuild script**
Run: `node scripts/rebuild-data.js`
Expected: "Processed 100+ notes. Generated search-index.json, graph-edges.json, and study-prompts.json."

- [ ] **Step 3: Commit**
```bash
git add data/vault-index.json data/search-index.json data/graph-edges.json data/study-prompts.json
git commit -m "build: rebuild data indexes for new modules"
```
