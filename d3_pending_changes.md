# D3 Pending Changes: Nitrostack UI Migration

This document outlines the architectural requirements for completing Phase 3 of the frontend (D3) using the deviated Nitrostack UI Widget approach instead of a standalone React application.

## Current State vs. Phase 3 Requirements

| Feature | Original Plan (D3 Phase 3) | Current Nitrostack State | Gap |
| :--- | :--- | :--- | :--- |
| **Evidence Graph** | `GraphCanvas` (Cytoscape) | ✅ Built (`app/evidence-graph`) | None |
| **Source Cards** | `SourceCard` showing record ID, dataset, tier, confidence | ❌ Missing | Needs a widget/modal linked to graph edge clicks. |
| **Dossier View** | Dossier view, SAR export rendering | ❌ Missing | Needs a widget for the `assemble_dossier` tool. |
| **Planner Log** | Live streaming of SSE events | ❌ Missing | Needs a global UI element or a widget for the orchestrator stream. |

## Architectural Implementation Guide

To bring the deviated D3 up to parity with the Phase 3 plan, the following architectural components must be implemented within the `packages/mcp-server/src/widgets/app/` directory and linked to the backend via `@Widget` decorators.

### 1. The Dossier & SAR Viewer Widget
**Objective:** Display the final investigation output, including the Suspicious Activity Report (SAR).
**Architecture:**
1. **Backend Link:** In `packages/mcp-server/src/modules/investigation/investigation.tools.ts`, add the `@Widget('dossier-view')` decorator to the `assembleDossierTool`.
2. **Frontend Route:** Create `packages/mcp-server/src/widgets/app/dossier-view/page.tsx`.
3. **Implementation:** Use `useWidgetSDK()` to retrieve the dossier JSON output. Render the target company, UBO, effective control percentage, sanctions hits, and the Explainer's SAR narrative.

### 2. The Source Card Widget
**Objective:** When an analyst clicks an edge (e.g., `owns_pct`) on the Evidence Graph, a card must appear showing the deterministic evidence (Record ID, Dataset, Tier, Confidence) backing that claim.
**Architecture:**
1. **Backend Link:** In `investigation.tools.ts`, add `@Widget('source-card')` to the `scoreEvidenceTool` or a dedicated resource endpoint.
2. **Frontend Route:** Create `packages/mcp-server/src/widgets/app/source-card/page.tsx`.
3. **Implementation:** Modify the existing `evidence-graph` widget so that clicking an edge invokes a new tool call (or opens a linked widget) passing the `edge_id`. The `source-card` widget then renders the evidence scoring details.

### 3. Orchestrator Stream Integration
**Objective:** The original plan required a "Planner Log" that streams the AI's actions live via SSE from the Orchestrator.
**Architecture:**
1. **Frontend Route:** This might require a custom global layout in `packages/mcp-server/src/widgets/app/layout.tsx` or a dedicated dashboard widget.
2. **Implementation:** Connect to the Orchestrator's `/stream/:id` endpoint using the native browser `EventSource` API. Listen for `planner_decision`, `tool_result`, and `edge_found` events, appending them to a scrolling log terminal in the UI.

## Summary

The deviated D3 approach is structurally sound but currently incomplete. By implementing the `dossier-view`, `source-card`, and connecting to the Orchestrator's SSE stream, the Nitrostack UI will achieve full feature parity with the original Phase 3 master plan.
