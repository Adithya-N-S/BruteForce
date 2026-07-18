/**
 * @fileoverview D4 Phase 3 — Demo-triggerable Evader perturbation ("re-route" moment)
 * (VEILBREAKER §3.6 / §13.2 / §20 step 5 / §22).
 *
 * This module wires the pure `perturbRemoveOwnershipEdge` from `./evader-perturb.ts`
 * into a demo-flow-friendly entry point. It is PURE — no I/O, no LLM, no network,
 * no side effects. It only REMOVES one real, sourced ownership edge; it never
 * injects unsourced facts.
 *
 * Architecture rule (§13.2, §22): the Evader NEVER injects unsourced facts. The
 * remaining edges are all still sourced. After the removal, the Planner must
 * re-discover control through the alternate shared-address route (edges e4/e5
 * connect Company A and UBO Ivan Petrov via addr_road_1).
 *
 * Depends ONLY on `@bruteforce/core` (frozen contract) and the planted-case loader.
 */

import type { EvidenceEdge } from '@bruteforce/core';
import { perturbRemoveOwnershipEdge, type PerturbationResult } from './evader-perturb.ts';
import { plantedCaseGraph } from './phase3-planted-case.ts';

/**
 * Run the scripted demo perturbation against the current investigation edge set.
 *
 * By default this operates on the planted case's edges (the canonical demo input). A
 * caller may pass the live graph's edges to perturb whatever investigation state is
 * current; the function simply forwards to `perturbRemoveOwnershipEdge`, removing the
 * highest-stake direct ownership edge whose `to` is `ent_company_a`.
 *
 * @param edges - current sourced edges in the investigation graph (defaults to the planted case).
 * @returns PerturbationResult: surviving edges, the single removed edge, and a demo reason.
 * @pure no I/O, no LLM, no side effects; returns new data only.
 */
export function runDemoPerturbation(
  edges: EvidenceEdge[] = plantedCaseGraph.edges as EvidenceEdge[],
): PerturbationResult {
  return perturbRemoveOwnershipEdge(edges, { from: 'ent_company_a' });
}

/**
 * Produce a human-readable description of a perturbation for the Planner Log UI.
 *
 * The description is narrative intent only — it never asserts a new factual
 * world-state beyond what the perturbation did (removing a sourced edge). It points
 * the Planner at the alternate modality (shared address / agent / etc.) it must now
 * use to re-establish control.
 *
 * @param result - the PerturbationResult returned by `runDemoPerturbation`.
 * @returns a ready-to-render string for the Planner Log.
 * @pure no I/O, no side effects.
 */
export function describePerturbation(result: PerturbationResult): string {
  const e = result.removed;
  const pct = e.value != null ? `${Math.round(e.value * 100)}%` : 'undisclosed';
  return (
    `Perturbation: Removed edge ${e.id} (${e.from} → ${e.to}, ${pct} ownership, ` +
    `record ${e.record_id}).\n` +
    `The Planner must now re-establish control via an alternate modality ` +
    `(shared address, agent, etc.).`
  );
}
