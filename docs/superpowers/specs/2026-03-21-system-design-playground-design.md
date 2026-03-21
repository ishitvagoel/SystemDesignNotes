# Design Spec: System Design Playground (Canvas)

## Goal
To transform the static System Design Vault into an interactive learning platform by adding a full-screen, drag-and-drop architectural "Canvas" that integrates load simulation, guided learning paths (Quests), and pattern comparisons.

## Architecture
- **View Layer:** A new top-level "Canvas" view (`#canvas-screen`) added to `index.html`.
- **Engine:** `js/canvas.js` (new file) containing a `CanvasEngine` class to manage SVG-based drag-and-drop using D3.js.
- **State:** `CANVAS_STATE` JSON structure to track nodes (LB, DB, etc.), edges (connections), and simulation parameters (RPS, Latency).
- **Data Integration:** 
  - `data/quests.json`: Definitions for interactive design scenarios.
  - `data/components.json`: Metadata for architectural building blocks (icons, default capacity, cost).

## Features
### 1. Interactive Design Canvas
- **Palette:** A sidebar of standard system components (LB, CDN, App Server, DB, Cache, Queue).
- **Stage:** A zoomable/pannable SVG area for placing and connecting components.
- **Properties Panel:** Contextual UI to configure selected components (e.g., "Replica Count", "Cache Size").

### 2. Load & Traffic Simulator
- **Visualizer:** Animate "packets" (circles) flowing along edges.
- **Bottleneck Detection:** Nodes change color (Green -> Yellow -> Red) based on their configured capacity vs. current load.
- **Metrics Dashboard:** Real-time sparklines for Throughput, Latency, and Error Rate.

### 3. Quest Mode (Learning Paths)
- **Scenarios:** Pre-loaded canvas states with specific goals (e.g., "Build a URL Shortener").
- **Interactive Feedback:** Real-time validation of design choices (e.g., "You need a Cache here to reduce DB load").
- **Completion State:** Visual rewards and "Unlock" next quest.

### 4. Solution Comparison
- **Split Canvas:** Divide the stage into two independent canvases.
- **Sync Scroll:** Synchronize pan/zoom across both designs.
- **Diff Stats:** Side-by-side metrics to compare performance/cost of two architectures.

## Implementation Plan (Phased)
1. **Phase 1: Foundation.** Add "Canvas" pill, `#canvas-screen` UI, and basic D3 drag-and-drop.
2. **Phase 2: Simulation.** Implement the packet flow animation and basic node capacity logic.
3. **Phase 3: Quests & Scenarios.** Build the quest loader and validation engine.
4. **Phase 4: Comparison & Polish.** Add split-view and UI refinements.

## Testing Strategy
- **Unit Tests:** Validate capacity calculations and state transitions in `CanvasEngine`.
- **Integration Tests:** Ensure Canvas state syncs with the property panel and metrics dashboard.
- **Manual Verification:** Test "Flash Sale" quest to confirm bottleneck detection works as expected.
