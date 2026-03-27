<div align="center">

# ⚡ 🧠 System Design Vault 🗺️ 🚀

### **The most interactive system design study environment on GitHub.**
#### 137 senior-engineer-level notes · 6 learning phases · AI/LLM/RAG · FinOps · 6 capstone systems

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-ishitvagoel.github.io%2FSystemDesignNotes-4f46e5?style=for-the-badge)](https://ishitvagoel.github.io/SystemDesignNotes/)
[![Version](https://img.shields.io/badge/version-v2.0-22c55e?style=for-the-badge)](https://ishitvagoel.github.io/SystemDesignNotes/changelog.html)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge)](LICENSE)
[![Stars](https://img.shields.io/github/stars/ishitvagoel/SystemDesignNotes?style=for-the-badge&color=ec4899)](https://github.com/ishitvagoel/SystemDesignNotes/stargazers)

</div>

---

## 🎯 Live Demo

<div align="center">

### **[→ Open the Vault](https://ishitvagoel.github.io/SystemDesignNotes/) ←**
*No login. No install. Works offline.*

</div>

<!-- SCREENSHOT PLACEHOLDER 1: Full-app hero screenshot (dark mode)
     Recommended: 1400×900px showing the sidebar + an open note with a Mermaid diagram
     Save as: docs/screenshot-hero.png
     Usage: ![App Hero](docs/screenshot-hero.png)
-->

<!-- SCREENSHOT PLACEHOLDER 2: Canvas split-view comparison GIF
     Recommended: 1200×700px GIF showing dragging components + split A/B comparison table
     Save as: docs/screenshot-canvas.gif
     Usage: ![Canvas Playground](docs/screenshot-canvas.gif)
-->

<!-- SCREENSHOT PLACEHOLDER 3: Study Mode + Knowledge Graph side-by-side
     Recommended: 1200×600px showing blurred study cards on left, D3 graph on right
     Save as: docs/screenshot-study-graph.png
     Usage: ![Study Mode & Graph](docs/screenshot-study-graph.png)
-->

---

## ✨ Features

| Feature | What it does |
|---|---|
| 🎨 **Interactive D3 Canvas** | Drag-and-drop architecture designer with live **throughput/latency simulation**, scale scenarios (1 → 10M users), and **split-view A/B comparison** with auto-generated trade-off tables |
| 📖 **Study Mode** | Per-section **blur-and-reveal** reading, **spaced-repetition flashcards** (200+ Q&A pairs), keyboard-driven difficulty ratings (Again / Hard / Easy), and **confetti celebrations** on milestones 🎉 |
| 🕸️ **Knowledge Graph** | Force-directed **D3 graph** of all 137 notes with cluster grouping, live filtering, minimap navigation, and relationship edges |
| 🔍 **Full-Text Search** | **Ctrl+K** instant search across all notes with relevance scoring — no backend, no Algolia, 100% local |
| 🗂️ **Multi-Tab Workflow** | Open multiple notes simultaneously, drag-to-reorder tabs, **Ctrl+Tab** cycling, and tab state persisted across reloads |
| 📦 **One-Click Obsidian Export** | Packages your entire vault as a **ZIP with YAML frontmatter**, ready to drop into Obsidian |
| 🖨️ **PDF + Markdown Export** | Export any note to **multi-page PDF** or copy raw markdown — perfect for interview prep sheets |
| 📡 **PWA + Offline Support** | Installable as a desktop/mobile app via Service Worker with **cache-first offline mode** — study on a plane ✈️ |
| 🌙 **Light / Dark Mode** | OS-aware theming with **theme-adaptive Mermaid diagrams** and full CSS variable system |
| ♿ **Full Accessibility** | ARIA attributes, keyboard navigation, focus styles — no mouse required |

---

## 📚 Curriculum — 137 Notes Across 8 Sections

| # | Section | Modules | Notes | Highlights |
|---|---|---|---|---|
| 0 | 🧩 **Design Thinking** | First Principles, Trade-offs, Constraints | 8 | Physics analogies, decision frameworks, pitfall catalogs |
| 1 | 🏗️ **Phase 1 — Foundations** | Networking, APIs, Databases, Caching, Storage, IDs | 41 | The biggest phase — covers ~70% of interview surface area |
| 2 | 🌐 **Phase 2 — Distribution** | Consistency, Consensus, Transactions, Replication | 20 | Raft, Paxos, CRDTs, 2PC/Saga deep-dives |
| 3 | ⚙️ **Phase 3 — Architecture & Ops** | Patterns, Messaging, Search, Security, Observability | 34 | CQRS, event sourcing, Kafka, Elasticsearch, SLOs |
| 4 | 🤖 **Phase 4 — Modern AI** | LLMOps, RAG & Agents, Serverless/Edge | 10 | Inference infra, vector DBs, embedding pipelines |
| 5 | 💰 **Phase 5 — FinOps** | Cost Engineering, Privacy & Compliance | 10 | Cloud spend optimization, GDPR/SOC2 design patterns |
| 6 | 🏆 **Phase 6 — Capstones** | 6 full end-to-end system designs | 7 | URL Shortener · News Feed · Payments · Collaborative Editor · Multi-Region E-Commerce · AI Search Chat |
| — | 📋 **Meta** | Glossary, Mastery Checklist, Templates | 7 | MOC (Map of Contents) navigation notes |

> [!TIP]
> Start with **Phase 0 → Design Thinking** before diving into Phase 1. It rewires how you reason about trade-offs and will make every subsequent note click faster.

---

## 🗃️ Use This as Your Own Obsidian Vault

Turn the entire vault into a local **Obsidian** workspace in 4 steps:

1. **Open the live site** → [ishitvagoel.github.io/SystemDesignNotes](https://ishitvagoel.github.io/SystemDesignNotes/)
2. Click the **`⬇ Export`** button in the top toolbar
3. Select **"Export as Obsidian Vault (.zip)"** — downloads a ZIP with all 137 `.md` files + YAML frontmatter
4. In Obsidian: **Open folder as vault** → select the unzipped folder

**What you get:**
- ✅ All notes with `tags`, `phase`, `module`, `aliases` frontmatter pre-filled
- ✅ Internal wiki-links (`[[Note Title]]`) already wired up
- ✅ Mermaid diagrams render natively in Obsidian
- ✅ Works with **Obsidian Graph View**, Dataview plugin, and Spaced Repetition plugin

> [!NOTE]
> Want to fork and add your own notes? See [Contributing](#-contribute) below — the CI pipeline auto-rebuilds all indexes when you add markdown files to `data/notes/`.

---

## 🛠️ Tech Stack

> **Zero heavy frameworks.** This entire app is ~5,000 lines of vanilla JS + CSS.

| Layer | Technology | Why |
|---|---|---|
| 🖼️ **UI** | Vanilla JS + HTML5 + CSS3 | No build step, instant load, no framework churn |
| 📊 **Canvas & Graph** | [D3.js v7](https://d3js.org/) | Force simulation, drag-and-drop, SVG rendering |
| 📝 **Markdown** | [marked.js v9](https://marked.js.org/) | Fast, lightweight Markdown → HTML |
| 📐 **Diagrams** | [Mermaid.js v10](https://mermaid.js.org/) | Architecture diagrams as code, theme-aware |
| 🔦 **Syntax Highlighting** | [highlight.js v11](https://highlightjs.org/) | Code blocks in 190+ languages |
| 📦 **Export** | [JSZip](https://stuk.github.io/jszip/) + [html2pdf](https://ekoopmans.github.io/html2pdf.js/) | Client-side ZIP + PDF generation |
| 🎉 **Confetti** | [canvas-confetti](https://www.kirilv.com/canvas-confetti/) | Because milestones deserve celebrations |
| 📡 **Offline** | Service Worker (Cache API) | Cache-first static assets, network-first data |
| ⚙️ **CI/CD** | GitHub Actions | Auto-rebuilds search + graph indexes on note changes |

---

## 🌟 Contribute

This vault is **open to contributions** — new notes, corrections, diagram improvements, and feature ideas are all welcome.

<div align="center">

[![Star on GitHub](https://img.shields.io/github/stars/ishitvagoel/SystemDesignNotes?style=for-the-badge&label=⭐%20Star%20this%20repo&color=f59e0b)](https://github.com/ishitvagoel/SystemDesignNotes/stargazers)
[![Fork](https://img.shields.io/github/forks/ishitvagoel/SystemDesignNotes?style=for-the-badge&label=🍴%20Fork%20it&color=6366f1)](https://github.com/ishitvagoel/SystemDesignNotes/fork)

</div>

**To add or improve notes:**
1. Fork the repo
2. Add/edit `.md` files inside `data/notes/` following the existing naming convention
3. The GitHub Actions workflow auto-runs `scripts/rebuild-data.js` to update all indexes
4. Open a PR — no local build step needed

**To report issues or request topics:** [Open an Issue →](https://github.com/ishitvagoel/SystemDesignNotes/issues)

---

<div align="center">

**[⚡ Open the Vault](https://ishitvagoel.github.io/SystemDesignNotes/)** · **[📋 Changelog](https://ishitvagoel.github.io/SystemDesignNotes/changelog.html)** · **[🐛 Issues](https://github.com/ishitvagoel/SystemDesignNotes/issues)**

---

MIT License © 2026 [Ishit Vagoel](https://github.com/ishitvagoel)

*Built with ❤️, vanilla JS, and an unhealthy obsession with distributed systems.*

**v2.0 — Last updated March 26, 2026**

</div>
