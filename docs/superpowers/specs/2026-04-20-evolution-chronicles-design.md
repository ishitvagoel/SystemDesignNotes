# Design Spec: The Evolution Chronicles

## Overview
**The Evolution Chronicles** is an interactive learning feature within the System Design Vault. it allows users to visualize and navigate the historical architectural evolution of famous systems (e.g., Twitter, Netflix, Airbnb) using a temporal slider on the Canvas Playground.

## Goals
- **Educational Value:** Demonstrate *why* systems change at specific scales (10k -> 1M -> 100M users).
- **Interactive Engagement:** Provide a tactile way to explore historical technical debt and refactoring milestones.
- **Deep Integration:** Connect historical "snapshots" to theoretical deep-dives in the existing Markdown notes.

## Architecture

### 1. Data Model (`data/evolution-chronicles.json`)
The system will be driven by a JSON manifest containing snapshots for each chronicled system.

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
          "nodes": [...],
          "links": [...]
        },
        {
          "id": "era-2",
          "label": "2010: The Migration to JVM",
          "scale": "1M Users",
          "narrative": "Introduced Kestrel MQ and migrated core services to Scala/Finagle.",
          "nodes": [...],
          "links": [...]
        }
      ]
    }
  ]
}
```

### 2. UI Components
- **Chronicles Tab:** A new sidebar tab in the Playground view to select a system.
- **Evolution Slider:** A persistent range input at the bottom of the SVG canvas.
- **Narrative HUD:** A translucent overlay in the top-right corner of the canvas displaying the current "Era" description and scale.
- **Node Highlighting:** Components that are "New" in the current era will have a subtle pulse animation; components marked for "Removal" in the next era will appear in a warning color.

### 3. Canvas Engine Enhancements (`js/canvas.js`)
- **`loadChronicle(systemId)`**: Fetches data and initializes the first snapshot.
- **`transitionToSnapshot(index)`**: Uses D3.js `.join()` with `.transition()` to smoothly interpolate node positions, opacity, and link routing between eras.
- **`syncWithNotes(nodeId)`**: Clicking a node in a snapshot will trigger the main app's `openNote(noteId)` function.

## User Flow
1. User navigates to the **Canvas** view.
2. User selects "Twitter" from the **Chronicles** sidebar.
3. The canvas loads the 2006 "Monorail" architecture.
4. User drags the slider to the middle.
5. The canvas morphs—the Monolith node shrinks, and new Microservice nodes "bud" out from it.
6. The Narrative HUD explains that the "Write-time Fanout" was causing the "Fail Whale" error.
7. User clicks the "Message Queue" node to read the *Event-Driven Architecture* note in the sidebar.

## Success Criteria
- Smooth D3 transitions (no jarring jumps) between architectural states.
- Clear technical reasoning provided for every major change in the timeline.
- Direct linking between Canvas components and existing study notes.
