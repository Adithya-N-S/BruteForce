import type { EntityId, Dossier, EvidenceEdge, MatchSanctionsResult } from '../types.js';
import type { GraphManager } from '../graph/graph-manager.js';
import { allControlPaths } from './all-control-paths.js';
import { computeControl } from './compute-control.js';
import { scoreEvidence } from './score-evidence.js';

export function assembleDossier(
  graph: GraphManager,
  params: { root: EntityId; target: EntityId },
  sanctionMatches?: MatchSanctionsResult
): Dossier {
  const paths = allControlPaths(graph, { from: params.target, to: params.root });
  const controlOutput = computeControl(paths);

  const contributingPaths = controlOutput.contributingPaths;
  if (contributingPaths.length === 0) {
    return {
      root: params.root,
      target: params.target,
      control: {
        effective_control: 0,
        contributing_paths: [],
        threshold: 0.25,
        meets_threshold: false,
      },
      evidence_confidence: {
        scored: [],
        aggregate_confidence: 0,
        weakest_link: null as unknown as EvidenceEdge,
      },
      sanctions: sanctionMatches ?? { matches: [] },
      assembled_at: new Date().toISOString(),
    };
  }

  const allEdges: EvidenceEdge[] = [];
  const seenEdgeIds = new Set<string>();
  for (const cp of contributingPaths) {
    for (const edge of cp.path) {
      if (!seenEdgeIds.has(edge.id)) {
        seenEdgeIds.add(edge.id);
        allEdges.push(edge as EvidenceEdge);
      }
    }
  }

  const scoredEdges = allEdges.map(edge => ({
    ...edge,
    confidence: scoreEvidence(edge).score,
  }));

  const weakestLink = scoredEdges.reduce((min, edge) =>
    (edge.confidence! < min.confidence!) ? edge : min
  );

  const aggregateConfidence = Math.min(...scoredEdges.map(e => e.confidence!));

  const control = {
    effective_control: controlOutput.effectiveControl,
    contributing_paths: controlOutput.contributingPaths,
    threshold: 0.25 as const,
    meets_threshold: controlOutput.thresholdReached,
  };

  return {
    root: params.root,
    target: params.target,
    control,
    evidence_confidence: {
      scored: scoredEdges,
      aggregate_confidence: aggregateConfidence,
      weakest_link: weakestLink,
    },
    sanctions: sanctionMatches ?? { matches: [] },
    assembled_at: new Date().toISOString(),
  };
}
