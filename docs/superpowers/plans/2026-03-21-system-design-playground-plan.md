# System Design Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the static System Design Vault into an interactive learning platform by adding a drag-and-drop architectural "Canvas" with load simulation and quests.

**Architecture:** A new top-level "Canvas" view using a lightweight, custom D3.js implementation for the drag-and-drop workspace, integrated with a basic traffic simulation engine.

**Tech Stack:** Vanilla JS, D3.js, CSS Grid/Flexbox, JSON for state.

---

### Task 1: UI Foundation & Navigation

**Files:**
- Modify: `index.html` (Add Canvas pill and screen)
- Modify: `css/styles.css` (Add Canvas-specific layout styles)
- Modify: `js/app.js` (Handle navigation to the Canvas view)

- [ ] **Step 1: Add Canvas pill to header**
In `index.html`, add `<button class="pill" id="view-canvas" data-tip="Design Playground">Canvas</button>` to `.header-pills`.

- [ ] **Step 2: Add Canvas screen container**
In `index.html`, add a new `#canvas-screen` div alongside `#graph-screen`.
```html
<div id="canvas-screen" style="display:none; flex:1; overflow:hidden; flex-direction:row; position:relative;">
  <div id="canvas-palette" class="canvas-sidebar"></div>
  <div id="canvas-stage-wrap" style="flex:1; position:relative; overflow:hidden;">
    <svg id="canvas-svg" style="width:100%; height:100%;"></svg>
  </div>
  <div id="canvas-props" class="canvas-sidebar"></div>
</div>
```

- [ ] **Step 3: Add basic CSS for Canvas layout**
In `css/styles.css`, add styles for `.canvas-sidebar`, `#canvas-palette`, and `#canvas-props`. Use `var(--bg2)` and `var(--border)`.

- [ ] **Step 4: Implement navigation logic**
In `js/app.js`, add an event listener for `#view-canvas` to show `#canvas-screen` and hide others.

- [ ] **Step 5: Commit**
```bash
git add index.html css/styles.css js/app.js
git commit -m "feat(canvas): add UI foundation and navigation for Canvas view"
```

---

### Task 2: Canvas Engine (D3 Drag & Drop)

**Files:**
- Create: `js/canvas.js` (Core CanvasEngine class)
- Modify: `index.html` (Include `js/canvas.js`)

- [ ] **Step 1: Initialize CanvasEngine class**
Create `js/canvas.js` with a basic class that takes an SVG selector and initializes a D3 zoom behavior.

- [ ] **Step 2: Implement "Add Component" logic**
Add a method to `CanvasEngine` that takes a component type and adds a node to the internal state.

- [ ] **Step 3: Implement D3 Drag behavior**
Add D3 drag handlers to update node positions in the state and re-render.

- [ ] **Step 4: Implement Connection (Edges) logic**
Allow users to click two nodes to create a link between them.

- [ ] **Step 5: Commit**
```bash
git add js/canvas.js index.html
git commit -m "feat(canvas): implement core drag-and-drop engine using D3"
```

---

### Task 3: Load & Traffic Simulator

**Files:**
- Modify: `js/canvas.js` (Add Simulation methods)

- [ ] **Step 1: Add Simulation State**
Add `simActive`, `rps`, and `nodeCapacities` to the `CanvasEngine`.

- [ ] **Step 2: Implement Packet Animation**
Use D3 transitions to animate small circles along edges from source to target nodes.

- [ ] **Step 3: Implement Bottleneck Logic**
Calculate load per node based on incoming edges. Update node color (Green -> Red) if load > capacity.

- [ ] **Step 4: Commit**
```bash
git add js/canvas.js
git commit -m "feat(canvas): add traffic simulation and bottleneck visualization"
```

---

### Task 4: Quests & Scenarios

**Files:**
- Create: `data/quests.json` (Quest definitions)
- Modify: `js/canvas.js` (Quest loader and validation)

- [ ] **Step 1: Define initial quests**
Create `data/quests.json` with a "Flash Sale" scenario.
```json
[
  {
    "id": "q1",
    "title": "Scale for Flash Sale",
    "description": "Your DB is crashing under load. Add a Cache to save it.",
    "initialState": { "nodes": [...], "edges": [...] },
    "winCondition": { "targetRps": 1000, "maxDbLoad": 0.8 }
  }
]
```

- [ ] **Step 2: Implement Quest Loader**
Add a UI element to select quests and a method to load them into the canvas.

- [ ] **Step 3: Implement Win Condition Validation**
Add a check in the simulation loop to verify if quest goals are met.

- [ ] **Step 4: Commit**
```bash
git add data/quests.json js/canvas.js
git commit -m "feat(canvas): implement quest mode and scenario validation"
```
