# Evolution Chronicles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive "Evolution Chronicles" feature that allows users to scrub through the historical architecture of famous systems using a temporal slider on the Canvas Playground.

**Architecture:** Data-driven snapshots stored in JSON, interpolated by an enhanced D3-based CanvasEngine. Narrative and scale data are displayed in a floating HUD.

**Tech Stack:** JavaScript (ES6), D3.js, CSS.

---

### Task 1: Foundation Data Structure

**Files:**
- Create: `data/evolution-chronicles.json`

- [ ] **Step 1: Create the initial chronicles dataset**
Create a skeleton for the Twitter evolution as defined in the spec.

```json
{
  "systems": [
    {
      "id": "twitter",
      "name": "Twitter: From Monolith to Microservices",
      "snapshots": [
        {
          "id": "era-1",
          "label": "2006: The Ruby Monolith",
          "scale": "10K Users",
          "narrative": "A simple CRUD app using Ruby on Rails. Bottleneck: Single DB lock contention.",
          "nodes": [
            { "id": "n1", "type": "app", "label": "Rails Monolith", "x": 400, "y": 200 },
            { "id": "n2", "type": "db", "label": "MySQL", "x": 400, "y": 400 }
          ],
          "links": [
            { "source": "n1", "target": "n2" }
          ]
        },
        {
          "id": "era-2",
          "label": "2010: The Migration to JVM",
          "scale": "1M Users",
          "narrative": "Introduced Kestrel MQ and migrated core services to Scala/Finagle.",
          "nodes": [
            { "id": "n1", "type": "app", "label": "Scala Service", "x": 300, "y": 200 },
            { "id": "n3", "type": "queue", "label": "Kestrel MQ", "x": 500, "y": 200 },
            { "id": "n2", "type": "db", "label": "MySQL Cluster", "x": 400, "y": 400 }
          ],
          "links": [
            { "source": "n1", "target": "n3" },
            { "source": "n3", "target": "n2" }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/evolution-chronicles.json
git commit -m "feat: add initial evolution chronicles data"
```

### Task 2: Canvas Engine Snapshot Support

**Files:**
- Modify: `js/canvas.js`

- [ ] **Step 1: Add `loadChronicle` and state variables to `CanvasEngine`**
Update the constructor to track chronicles and add a method to fetch/load them.

```javascript
// In constructor
this.chronicles = null;
this.currentChronicle = null;
this.currentSnapshotIndex = 0;

// Method
async loadChronicles() {
  try {
    const res = await fetch('data/evolution-chronicles.json');
    this.chronicles = await res.json();
  } catch (e) {
    console.error('Failed to load chronicles:', e);
  }
}
```

- [ ] **Step 2: Implement `setSnapshot(index)`**
This method will update the engine's nodes and links to match the snapshot and trigger a re-render.

```javascript
setSnapshot(index) {
  if (!this.currentChronicle) return;
  this.currentSnapshotIndex = index;
  const snapshot = this.currentChronicle.snapshots[index];
  
  // Update internal state
  this.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
  this.links = JSON.parse(JSON.stringify(snapshot.links));
  
  // Update HUD (we'll build the HUD in Task 3)
  this.updateHUD(snapshot);
  
  this.render(); // Existing render method
}
```

- [ ] **Step 3: Update `render()` to use transitions**
Modify the existing D3 selection logic in `render()` to use `.transition().duration(750)`.

```javascript
// Inside render()
const node = this.container.selectAll('.node')
  .data(this.nodes, d => d.id)
  .join(
    enter => enter.append('g').attr('class', 'node').style('opacity', 0)
      .call(e => e.transition().duration(750).style('opacity', 1)),
    update => update.call(u => u.transition().duration(750)),
    exit => exit.call(e => e.transition().duration(750).style('opacity', 0).remove())
  );
```

- [ ] **Step 4: Commit**

```bash
git add js/canvas.js
git commit -m "feat: add snapshot transition support to CanvasEngine"
```

### Task 3: The Narrative HUD & Sidebar UI

**Files:**
- Modify: `css/styles.css`
- Modify: `index.html`
- Modify: `js/app.js`

- [ ] **Step 1: Add HUD and Sidebar Tab Styles**
Add styles for the floating Narrative HUD and the new Chronicles sidebar list.

```css
#narrative-hud {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 280px;
  background: rgba(20, 22, 20, 0.85);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  pointer-events: none;
  z-index: 20;
}

#chronicles-slider-wrap {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  background: rgba(20, 22, 20, 0.9);
  padding: 12px 24px;
  border-radius: 50px;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 20;
}
```

- [ ] **Step 2: Add HTML Elements**
Update the `#canvas-screen` in `index.html` to include the HUD and slider container.

```html
<div id="canvas-screen" ...>
  <div id="narrative-hud" style="display:none;">
    <div id="hud-era" style="color:var(--yellow); font-family:var(--mono); font-size:10px; text-transform:uppercase;"></div>
    <div id="hud-scale" style="font-size:16px; margin:4px 0;"></div>
    <div id="hud-text" style="font-size:12px; color:var(--text2); line-height:1.4;"></div>
  </div>
  <div id="chronicles-slider-wrap" style="display:none;">
    <input type="range" id="evolution-slider" style="flex:1;">
    <div id="slider-label" style="font-family:var(--mono); font-size:10px; min-width:80px;"></div>
  </div>
  <!-- Existing SVG here -->
</div>
```

- [ ] **Step 3: Wire up the Sidebar & Slider**
In `js/app.js` (or a dedicated init section), handle the loading of chronicles into the sidebar and the slider input events.

```javascript
// Inside CanvasEngine init or app.js
async function initChronicles() {
  await engine.loadChronicles();
  const list = document.getElementById('chronicles-list');
  engine.chronicles.systems.forEach(sys => {
    const btn = document.createElement('div');
    btn.className = 'sidebar-item';
    btn.textContent = sys.name;
    btn.onclick = () => startChronicle(sys);
    list.appendChild(btn);
  });
}

function startChronicle(sys) {
  engine.currentChronicle = sys;
  document.getElementById('narrative-hud').style.display = 'block';
  document.getElementById('chronicles-slider-wrap').style.display = 'flex';
  const slider = document.getElementById('evolution-slider');
  slider.max = sys.snapshots.length - 1;
  slider.value = 0;
  slider.oninput = (e) => engine.setSnapshot(parseInt(e.target.value));
  engine.setSnapshot(0);
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css js/app.js
git commit -m "feat: implement HUD and evolution slider UI"
```

### Task 4: Polish & Integration

**Files:**
- Modify: `js/canvas.js`
- Modify: `data/evolution-chronicles.json`

- [ ] **Step 1: Add "New Component" Highlighting**
Modify `render()` in `js/canvas.js` to add a CSS class to nodes that were not in the previous snapshot.

```javascript
// In setSnapshot
const prevIds = new Set(this.nodes.map(n => n.id));
// ... load new nodes ...
this.nodes.forEach(n => {
  n.isNew = !prevIds.has(n.id);
});

// In render() node join
enter.append('g')
  .classed('node-pulse', d => d.isNew)
```

- [ ] **Step 2: Add Netflix and Airbnb data**
Populate `data/evolution-chronicles.json` with basic snapshots for two more systems to show variety.

- [ ] **Step 3: Verify all transitions and HUD updates**
Manual verification: Open Canvas -> Select Chronicle -> Drag Slider -> Check HUD text and node transitions.

- [ ] **Step 4: Commit**

```bash
git commit -m "polish: add new node pulse animation and expanded chronicle data"
```
