/**
 * @fileoverview D4 Phase 3 — QA checklist for the VEILBREAKER demo (§3.6 / §3.8 / §14 / §20).
 *
 * A typed, machine-readable checklist of the demo-critical acceptance checks. Each item
 * declares whether it is enforced by an automated test (`automated: true`) or must be
 * manually verified in the running demo (`automated: false`). A harness can import
 * `QA_CHECKLIST` to drive a pre-demo gate. PURE — no I/O, no LLM, no side effects.
 *
 * Categories map to the master-doc invariants:
 *  - deterministic-wall: the AI never produces an unsourced fact/number (§3.8, §14).
 *  - audit:              the investigation replays deterministically (§18, §22).
 *  - demo-flow:          the planted golden path + re-route moment work end-to-end (§20).
 *  - ui:                 the live graph / planner log / highlight behaviours.
 *  - deployment:         the public MCP URL + Claude Desktop MCP-compat.
 */

export type QACategory =
  | 'deterministic-wall'
  | 'audit'
  | 'ui'
  | 'demo-flow'
  | 'deployment';

export interface QACheckItem {
  id: string;
  category: QACategory;
  description: string;
  how_to_verify: string;
  automated: boolean; // true if checked by a test, false if manual
}

export const QA_CHECKLIST: QACheckItem[] = [
  // ---------------- Deterministic Wall (§3.8 invariant test) ----------------
  {
    id: 'no-unsourced-numbers',
    category: 'deterministic-wall',
    description:
      'Every number in the Explainer narrative appears in tool outputs (§3.8 invariant test).',
    how_to_verify:
      'Run the invariant test: scan Explainer output, fail if any number is absent from compute_control / score_evidence outputs.',
    automated: true,
  },
  {
    id: 'compute-control-only-pct',
    category: 'deterministic-wall',
    description: 'No percentage displayed in UI except from compute_control output.',
    how_to_verify:
      'Assert UI renders percentages only from compute_control.effectiveControl; grep narrative + UI for hard-coded %.',
    automated: true,
  },
  {
    id: 'score-evidence-only-conf',
    category: 'deterministic-wall',
    description: 'No confidence number displayed except from score_evidence output.',
    how_to_verify:
      'Assert UI renders confidence only from score_evidence confidenceScore; invariant test covers narrative.',
    automated: true,
  },
  {
    id: 'planner-no-facts',
    category: 'deterministic-wall',
    description: 'Planner rationale_text contains no factual assertions (no "X owns Y%").',
    how_to_verify:
      'Parse Planner decisions; flag any rationale_text containing ownership percentages or asserted relationships not in prior tool output.',
    automated: true,
  },
  {
    id: 'edges-all-sourced',
    category: 'deterministic-wall',
    description: 'Every EvidenceEdge has source_dataset + record_id + reliability_tier.',
    how_to_verify:
      'Validate every edge in the graph/store carries the three provenance fields; unit test on seed + tools.',
    automated: true,
  },

  // ---------------- Audit (§18, §22) ----------------
  {
    id: 'audit-log-every-call',
    category: 'audit',
    description: 'Every tool call produces an AuditEntry in the audit log.',
    how_to_verify: 'After a run, assert audit_log length == number of tool calls; each entry has records_used.',
    automated: true,
  },
  {
    id: 'audit-replay-deterministic',
    category: 'audit',
    description: 'Same {seed, target, tool-sequence} reproduces the same result.',
    how_to_verify: 'Replay the golden path twice from the same seed; assert byte-identical dossier + audit log.',
    automated: true,
  },

  // ---------------- Demo Flow (§20) ----------------
  {
    id: 'golden-path-green',
    category: 'demo-flow',
    description: 'POST /investigate "Company A" returns dossier with control >= 25% + sanctioned UBO.',
    how_to_verify: 'Run GOLDEN_PATH_STEPS replay against the live server; assert meetsThreshold + sanctioned UBO.',
    automated: true,
  },
  {
    id: 'perturbation-reroute',
    category: 'demo-flow',
    description: 'After removing one edge, Planner re-establishes control via shared-address route.',
    how_to_verify: 'Trigger runDemoPerturbation in a live run; confirm Planner finds control via edges e4/e5 (addr_road_1).',
    automated: true,
  },
  {
    id: 'source-card-every-edge',
    category: 'demo-flow',
    description: 'Clicking any edge in the graph opens a source card with record_id + tier.',
    how_to_verify: 'Click each rendered edge in the UI; assert a source card shows record_id + reliability_tier.',
    automated: false,
  },

  // ---------------- UI ----------------
  {
    id: 'graph-updates-live',
    category: 'ui',
    description: 'Graph grows as edge_found SSE events arrive.',
    how_to_verify: 'Open the console; confirm a new node/edge appears per edge_found event.',
    automated: false,
  },
  {
    id: 'planner-log-streams',
    category: 'ui',
    description: 'Planner decisions appear in real-time.',
    how_to_verify: 'Watch the Planner Log panel; confirm a new line per planner_decision SSE event.',
    automated: false,
  },
  {
    id: 'sanctioned-node-red',
    category: 'ui',
    description: 'Sanctioned UBO node is highlighted red after sanction_hit event.',
    how_to_verify: 'After a sanction_hit SSE event, confirm the UBO node carries the red highlight class.',
    automated: false,
  },

  // ---------------- Deployment ----------------
  {
    id: 'public-url-reachable',
    category: 'deployment',
    description: 'Deployed MCP URL responds from a clean machine.',
    how_to_verify: 'curl the deployed MCP URL from a machine with no local state; assert HTTP 200.',
    automated: false,
  },
  {
    id: 'claude-desktop-connects',
    category: 'deployment',
    description: 'Claude Desktop can call a tool on the deployed MCP server.',
    how_to_verify: 'Connect Claude Desktop to the deployed server; invoke resolve_entity and confirm a sourced result.',
    automated: false,
  },
];
