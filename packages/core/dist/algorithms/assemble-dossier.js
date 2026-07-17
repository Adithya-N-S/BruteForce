import { allControlPaths } from './all-control-paths.js';
import { computeControl } from './compute-control.js';
import { scoreEvidence } from './score-evidence.js';
export function assembleDossier(graph, params, sanctionMatches) {
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
                weakest_link: null,
            },
            sanctions: sanctionMatches ?? { matches: [] },
            assembled_at: new Date().toISOString(),
        };
    }
    const allEdges = [];
    const seenEdgeIds = new Set();
    for (const cp of contributingPaths) {
        for (const edge of cp.path) {
            if (!seenEdgeIds.has(edge.id)) {
                seenEdgeIds.add(edge.id);
                allEdges.push(edge);
            }
        }
    }
    const scoredEdges = allEdges.map(edge => ({
        ...edge,
        confidence: scoreEvidence(edge).score,
    }));
    const weakestLink = scoredEdges.reduce((min, edge) => (edge.confidence < min.confidence) ? edge : min);
    const aggregateConfidence = Math.min(...scoredEdges.map(e => e.confidence));
    const control = {
        effective_control: controlOutput.effectiveControl,
        contributing_paths: controlOutput.contributingPaths,
        threshold: 0.25,
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
//# sourceMappingURL=assemble-dossier.js.map