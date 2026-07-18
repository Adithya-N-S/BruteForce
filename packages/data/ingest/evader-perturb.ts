/**
 * @fileoverview D4 Phase 3 — Offline / scripted Evader perturbation (VEILBREAKER §3.6 / §13.2).
 *
 * Design rule (§13.2, §22):
 *   The Evader is OFFLINE / SCRIPTED ONLY. It must NEVER inject unsourced facts
 *   into the live investigation truth path. The only permitted live action is a
 *   single, pre-scripted, DETERMINISTIC mutation: remove ONE real, sourced
 *   ownership edge so the Planner is forced to re-establish control through an
 *   alternate (e.g. shared-address) modality — the "re-route" moment.
 *
 * This module is pure: it takes an EvidenceGraph's edge list and returns a NEW
 * edge list with exactly one edge removed, plus metadata describing what was
 * removed. It never fabricates edges or changes any `record_id`.
 *
 * It depends ONLY on `@bruteforce/core` (frozen contract) — no other
 * core module, no I/O, no LLM. Safe to use from the orchestrator's demo flow.
 */

import type { EvidenceEdge, EntityId } from '@bruteforce/core';

export interface PerturbationResult {
  /** The surviving edges after the deterministic removal (new array, original untouched). */
  edges: EvidenceEdge[];
  /** The single edge that was removed — the one the Planner must route around. */
  removed: EvidenceEdge;
  /** Human-readable reason, used by the demo narrator only (never a factual claim). */
  reason: string;
}

/**
 * Remove a single ownership edge (`owns_pct`) deterministically, preferring the
 * highest-stake direct edge that still leaves an alternate route discoverable.
 *
 * Determinism: selection is by stable sort on (value DESC, record_id ASC), so the
 * same input always yields the same removal — reproducible "re-route" every run.
 *
 * @param edges        - current sourced edges in the investigation graph
 * @param options.from - optional entity to prefer as the edge's `to` (the target
 *                        whose direct control is being obscured). Defaults to the
 *                        most common `to` among `owns_pct` edges.
 * @returns PerturbationResult with the mutated edge list and the removed edge.
 * @throws {Error} if no removable `owns_pct` edge exists in the input.
 */
export function perturbRemoveOwnershipEdge(
  edges: EvidenceEdge[],
  options: { from?: EntityId } = {},
): PerturbationResult {
  const ownershipEdges = edges.filter((e) => e.type === 'owns_pct');

  if (ownershipEdges.length === 0) {
    throw new Error(
      'perturbRemoveOwnershipEdge: no owns_pct edge present to remove — perturbation aborted (no unsourced mutation performed).',
    );
  }

  // Preferred target: explicit option, else the most frequent `to` of ownership edges.
  const targetTo = options.from ?? mostFrequentTo(ownershipEdges);

  const candidates = ownershipEdges
    .filter((e) => e.to === targetTo)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.record_id.localeCompare(b.record_id));

  // Remove the highest-stake direct edge on the preferred target; fall back to the
  // global highest-stake edge if the preferred target has none in scope.
  const fallback = [...ownershipEdges].sort(
    (a, b) => (b.value ?? 0) - (a.value ?? 0) || a.record_id.localeCompare(b.record_id),
  )[0]!;

  const toRemove = candidates[0] ?? fallback;

  const remaining = edges.filter((e) => e.id !== toRemove.id);

  return {
    edges: remaining,
    removed: toRemove,
    reason: `Removed ownership edge ${toRemove.id} (record ${toRemove.record_id}, ${((toRemove.value ?? 0) * 100).toFixed(0)}%) so the Planner must re-establish control via an alternate modality.`,
  };
}

/**
 * Helper: the entity most often appearing as the `to` of an `owns_pct` edge —
 * i.e. the entity receiving the most direct ownership links in the current graph.
 */
function mostFrequentTo(edges: EvidenceEdge[]): EntityId {
  const counts = new Map<EntityId, number>();
  for (const e of edges) {
    counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  }
  let best: EntityId = edges[0]!.to;
  let bestCount = -1;
  for (const [entity, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = entity;
    }
  }
  return best;
}
