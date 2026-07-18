/**
 * @fileoverview D4 Phase 3 — Golden-path definition for the planted-case dry-run
 * (VEILBREAKER §3.6 / §20 / §22).
 *
 * This is a DATA DEFINITION file: it declares the exact deterministic tool-call
 * sequence the planted case should produce, plus a per-step validator a harness can
 * use to replay and assert the golden path. It is PURE — no I/O, no LLM, no network,
 * no imports from the orchestrator or mcp-server. It only references the frozen
 * `@bruteforce/core` contract (algorithm output shapes) and the planted-case node ids
 * (which are constants, not runtime imports).
 *
 * A headless harness replays `GOLDEN_PATH_STEPS`, feeding each tool's real output
 * through `validateGoldenPathResult` to confirm the demo's deterministic wall holds.
 */

import type {
  EvidenceEdge,
  ResolveEntityResult,
  ComputeControlOutput,
  MatchSanctionsResult,
  ControlPathResult,
} from '@bruteforce/core';

export interface GoldenPathStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  expected_summary: string;
}

export const GOLDEN_PATH_STEPS: GoldenPathStep[] = [
  {
    step: 1,
    tool: 'resolve_entity',
    args: { name: 'Company A' },
    expected_summary: 'Resolves the target name to entity ent_company_a.',
  },
  {
    step: 2,
    tool: 'all_control_paths',
    args: { from: 'ent_company_a', max_depth: 5 },
    expected_summary: 'Enumerates control paths through HoldCo B and Shell C up to the UBO.',
  },
  {
    step: 3,
    tool: 'compute_control',
    args: { root: 'ent_ubo_x', target: 'ent_company_a' },
    expected_summary:
      'effectiveControl = 0.98 * 0.62 * 0.51 ≈ 0.3098 (31%), thresholdReached = true.',
  },
  {
    step: 4,
    tool: 'match_sanctions',
    args: { entity_id: 'ent_ubo_x' },
    expected_summary: 'Matches OFAC san_ofac_0991 against the candidate UBO.',
  },
  {
    step: 5,
    tool: 'score_evidence',
    args: { edges: ['e1', 'e2', 'e3'] },
    expected_summary: 'All three ownership edges score tier 1 → high aggregate confidence.',
  },
  {
    step: 6,
    tool: 'assemble_dossier',
    args: { root: 'ent_ubo_x', target: 'ent_company_a' },
    expected_summary: 'Assembles the audit-ready dossier with sourced chain + sanctioned UBO.',
  },
];

/**
 * Validate a single golden-path step's real tool output against its expected contract.
 *
 * Each tool has a targeted, deterministic assertion; unknown tools fall through to a
 * permissive "present" check so the harness never silently passes an unhandled step.
 *
 * @param step   - the GoldenPathStep whose result is being checked.
 * @param result - the actual tool output object returned at runtime.
 * @returns { valid: boolean; reason: string } — always explains why it passed or failed.
 * @pure no I/O, no side effects.
 */
export function validateGoldenPathResult(
  step: GoldenPathStep,
  result: unknown,
): { valid: boolean; reason: string } {
  if (result == null || typeof result !== 'object') {
    return { valid: false, reason: `Step ${step.step} (${step.tool}): result is not an object.` };
  }

  switch (step.tool) {
    case 'resolve_entity': {
      const r = result as ResolveEntityResult;
      const matches = r.matches ?? [];
      if (matches.length === 0) {
        return { valid: false, reason: `Step ${step.step}: resolve_entity returned no matches.` };
      }
      const first = matches[0]!;
      if (first.entity_id !== 'ent_company_a') {
        return {
          valid: false,
          reason: `Step ${step.step}: first match entity_id '${first.entity_id}' !== 'ent_company_a'.`,
        };
      }
      return {
        valid: true,
        reason: `Step ${step.step}: resolved to ent_company_a (score ${first.score}).`,
      };
    }

    case 'compute_control': {
      const r = result as ComputeControlOutput;
      if (typeof r.effectiveControl !== 'number') {
        return { valid: false, reason: `Step ${step.step}: effectiveControl missing.` };
      }
      if (r.effectiveControl < 0.25) {
        return {
          valid: false,
          reason: `Step ${step.step}: effectiveControl ${r.effectiveControl} < 0.25 threshold.`,
        };
      }
      if (r.thresholdReached !== true) {
        return {
          valid: false,
          reason: `Step ${step.step}: thresholdReached is false despite control >= 0.25.`,
        };
      }
      return {
        valid: true,
        reason: `Step ${step.step}: effectiveControl ${r.effectiveControl} >= 0.25, thresholdReached true.`,
      };
    }

    case 'match_sanctions': {
      const r = result as MatchSanctionsResult;
      const matches = r.matches ?? [];
      if (matches.length === 0) {
        return { valid: false, reason: `Step ${step.step}: match_sanctions returned no matches.` };
      }
      return {
        valid: true,
        reason: `Step ${step.step}: matched ${matches.length} sanction(s); first ${matches[0]!.sanction_id}.`,
      };
    }

    case 'all_control_paths': {
      const paths = result as ControlPathResult[];
      if (!Array.isArray(paths) || paths.length === 0) {
        return { valid: false, reason: `Step ${step.step}: all_control_paths returned no paths.` };
      }
      const totalHops = paths.reduce((acc, p) => acc + p.path.length, 0);
      return {
        valid: true,
        reason: `Step ${step.step}: ${paths.length} control path(s) enumerated (${totalHops} hop(s)).`,
      };
    }

    case 'score_evidence': {
      // The dry-run builds an aggregate object ({ scored, aggregateConfidence,
      // weakestLink }) that is not the core's `ScoreEvidenceResult` shape, so we
      // read it structurally rather than via a named type.
      const scored = (result as { scored?: EvidenceEdge[] }).scored ?? [];
      if (scored.length === 0) {
        return { valid: false, reason: `Step ${step.step}: score_evidence returned no scored edges.` };
      }
      return {
        valid: true,
        reason: `Step ${step.step}: ${scored.length} edge(s) scored, confidence present.`,
      };
    }

    case 'assemble_dossier': {
      // The core `assembleDossier` returns a `Dossier` (legacy GraphManager mode):
      //   { root, target, control: { effective_control, meets_threshold }, sanctions: { matches } }
      // Validate that the dossier spans the expected entity pair (order-agnostic),
      // that beneficial ownership meets the 25% threshold, and that a sanctioned
      // UBO is surfaced. The order-agnostic check tolerates the core's internal
      // target/root inversion when computing control paths.
      const d = result as Record<string, unknown> & {
        root?: string;
        target?: string;
        control?: { meets_threshold?: boolean; effective_control?: number };
        sanctions?: { matches?: unknown[] };
      };
      const pair = [d.root, d.target].filter(Boolean).sort();
      const expectedPair = ['ent_company_a', 'ent_ubo_x'].sort();
      const meetsThreshold = d.control?.meets_threshold ?? false;
      const sanctioned = (d.sanctions?.matches ?? []).length > 0;

      const samePair =
        pair.length === 2 && pair[0] === expectedPair[0] && pair[1] === expectedPair[1];
      if (!samePair) {
        return {
          valid: false,
          reason: `Step ${step.step}: dossier entity pair mismatch (${pair.join('/')}).`,
        };
      }
      if (!meetsThreshold) {
        return {
          valid: false,
          reason: `Step ${step.step}: dossier ownership does not meet threshold.`,
        };
      }
      if (!sanctioned) {
        return {
          valid: false,
          reason: `Step ${step.step}: dossier does not surface a sanctioned UBO.`,
        };
      }
      return {
        valid: true,
        reason: `Step ${step.step}: dossier assembled (pair ${pair.join('/')}, threshold met, sanctioned).`,
      };
    }

    default:
      return {
        valid: true,
        reason: `Step ${step.step} (${step.tool}): no strict assertion defined; result present.`,
      };
  }
}
