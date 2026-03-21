# System Design Learning Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the interactive playground into a high-efficiency learning tool with scale-aware simulation, branching decision scenarios, and side-by-side architectural comparisons.

**Architecture:** Extend `CanvasEngine` with a global `scaleFactor` and state machine for scenarios. Refactor the canvas to be multi-instantiable for split-view comparison mode.

**Tech Stack:** Vanilla JS, D3.js, HTML5 LocalStorage, CSS Transitions.

---

### Task 1: Evolution Scale Slider

**Files:**
- Modify: `index.html` (Add slider UI)
- Modify: `js/canvas.js` (Implement scale logic)

- [ ] **Step 1: Add Scale Slider UI**
Add a logarithmic range input to `#canvas-toolbar` in `index.html`.
```html
<div id="canvas-scale-control" style="display:flex; align-items:center; gap:10px; margin-left:20px; background:var(--bg3); padding:4px 12px; border-radius:20px; border:1px solid var(--border);">
  <span style="font-size:10px; color:var(--text3);">SCALE:</span>
  <input type="range" id="canvas-scale-slider" min="0" max="7" step="1" value="0" style="width:120px;">
  <span id="canvas-scale-label" style="font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--accent); min-width:60px;">1 User</span>
</div>
```

- [ ] **Step 2: Implement Scale Logic in CanvasEngine**
Update `startSimulation` to use `this.scaleFactor` (derived from slider).
```javascript
const userCounts = [1, 100, 1000, 10000, 100000, 1000000, 5000000, 10000000];
const rpsPerUser = 0.01; // Average RPS per active user
this.currentRps = userCounts[this.scaleIndex] * rpsPerUser;
```

- [ ] **Step 3: Add "Break Point" Pause**
In the simulation loop, if `node.load > node.capacity`, pause the simulation and show a "Scale Warning" toast.

- [ ] **Step 4: Commit**
```bash
git add index.html js/canvas.js
git commit -m "feat(learning-suite): implement evolutionary scale slider and scale-aware simulation"
```

---

### Task 2: Decision Engine (Scenario Modals)

**Files:**
- Create: `data/scenarios.json`
- Modify: `js/canvas.js` (Decision logic)

- [ ] **Step 1: Define Scenarios Data**
Create `data/scenarios.json` with branching nodes.
```json
{
  "q1_junction_1": {
    "text": "Your DB is at 90% load. How will you scale?",
    "choices": [
      { "text": "Vertical Scaling", "impact": { "cost": 500, "capacity": 2000 }, "note": "Expensive, has a hard ceiling." },
      { "text": "Add Cache", "impact": { "cost": 50, "capacity": 10000 }, "note": "Highly efficient for read-heavy loads." }
    ]
  }
}
```

- [ ] **Step 2: Build Decision Modal UI**
Create a method `showDecisionModal(junctionId)` that renders an overlay with choices.

- [ ] **Step 3: Implement Choice Application**
When a choice is selected, update `selectedNode` attributes and resume simulation.

- [ ] **Step 4: Commit**
```bash
git add data/scenarios.json js/canvas.js
git commit -m "feat(learning-suite): add decision engine and interactive scenario modals"
```

---

### Task 3: Side-by-Side Comparator

**Files:**
- Modify: `index.html` (Dual canvas layout)
- Modify: `js/canvas.js` (Multi-instance support)

- [ ] **Step 1: Refactor CanvasEngine for Multi-Instance**
Ensure `CanvasEngine` doesn't rely on global IDs for its internal elements.

- [ ] **Step 2: Implement "Compare" Mode UI**
Add a "Compare" button that splits `#canvas-stage-wrap` into two panels.

- [ ] **Step 3: Sync Simulation**
Update the simulation trigger to start both `playgroundA` and `playgroundB` at the same scale.

- [ ] **Step 4: Commit**
```bash
git add index.html js/canvas.js
git commit -m "feat(learning-suite): implement side-by-side architectural comparison mode"
```
