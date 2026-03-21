# Design Spec: System Design Learning Suite

## Goal
To maximize learning efficiency by transforming the static playground into an interactive "Evolutionary Architect" experience. The suite focus on *why* decisions are made and *when* systems need to change.

## Architecture
- **State Management:** Enhance `CANVAS_STATE` to include a `globalScale` (1 to 10,000,000 users) and `activeScenario` (Decision Tree state).
- **Engine Enhancement:**
  - `ScaleEngine`: Translates `globalScale` into incoming traffic (RPS).
  - `DecisionEngine`: Manages branching logic for scenarios, pausing the simulation at key "Architectural Junctions."
  - `ComparisonManager`: Orchestrates two independent `CanvasEngine` instances in a split-view mode.
- **Data Schemas:**
  - `data/scenarios.json`: Branching decision nodes with `id`, `text`, `choices`, `impact`, and `learningNote`.
  - `data/benchmarks.json`: Baseline performance data for common architectural patterns (Monolith vs. Microservices).

## Features
### 1. Evolutionary Scale Slider
- **UI:** A logarithmic slider (1 -> 10M) at the bottom of the `#canvas-screen`.
- **Logic:** As the slider moves, `trafficFactor` increases. At specific "Break Points" (e.g., 10k users), the simulation pauses and highlights a bottleneck with a hint (e.g., "Time to add a Load Balancer!").
- **Visuals:** SVG "shake" effects and color shifts as nodes approach 100% capacity.

### 2. Decision Tree Scenarios ("Why" Mode)
- **Interactive Modals:** During a quest, a modal appears at key steps. 
  - *Example:* "How will you handle high write volume?"
  - *Choices:* [A] Write-back Cache, [B] DB Partitioning, [C] Message Queue.
- **Immediate Feedback:** Selecting a choice updates the canvas and displays the "Architect's Note" explaining the tradeoffs (Latency, Consistency, Cost).

### 3. Split-View Trade-off Comparator
- **Side-by-Side:** View two different designs (e.g., SQL vs NoSQL) on the same screen.
- **Simultaneous Sim:** Clicking "Simulate" runs traffic through both designs at the same scale.
- **Metrics Table:** A real-time table below the canvases comparing:
  - Total Monthly Cost (Estimated)
  - Avg. Response Latency (ms)
  - Complexity Score (1-10)
  - Failure Resistance (Redundancy check)

## Implementation Plan (Phased)
1. **Phase 1: Scale Engine.** Implement the logarithmic slider and scale-aware traffic generation.
2. **Phase 2: Decision Engine.** Build the branching scenario loader and decision modal UI.
3. **Phase 3: Side-by-Side View.** Refactor the Canvas into a reusable component for split-view.
4. **Phase 4: Content & Polish.** Author 3-5 comprehensive scenarios and polish the tradeoff metrics.

## Testing Strategy
- **Scenario Validation:** Ensure every branch in `scenarios.json` leads to a valid (or intentionally broken) canvas state.
- **Scale Stress Test:** Verify the simulation remains performant at the 10M user mark (visual optimization).
- **Metric Accuracy:** Cross-reference estimated costs and latencies with real-world industry benchmarks.
