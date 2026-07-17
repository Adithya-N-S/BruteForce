import { EvidenceEdge, ConfidenceBand } from '../types.js';
export interface ScoreWeights {
    dataset: number;
    reliability: number;
    recency: number;
    completeness: number;
    provenance: number;
}
export declare const DEFAULT_WEIGHTS: ScoreWeights;
export interface ScoreEvidenceResult {
    score: number;
    level: ConfidenceBand;
    explanation: string;
}
/**
 * Deterministically scores an evidence edge based on its attributes.
 *
 * The score is a weighted average of 5 components:
 * 1. Dataset: Base quality of the source dataset.
 * 2. Reliability Tier: The tier (1, 2, 3) of the source.
 * 3. Recency: How recently the record was observed (decays over time).
 * 4. Completeness: Presence of optional but valuable fields.
 * 5. Provenance: Confidence in the extraction method.
 *
 * @param edge The evidence edge to score.
 * @param weights Configurable weights for the scoring components.
 * @param evaluationDate ISO 8601 date string to use as "now" for recency calculations. If not provided, defaults to '2026-01-01T00:00:00Z' to ensure pure determinism if no date is passed.
 * @returns The confidence score, categorical confidence level, and human-readable explanation.
 */
export declare function scoreEvidence(edge: EvidenceEdge, weights?: ScoreWeights, evaluationDate?: string): ScoreEvidenceResult;
//# sourceMappingURL=score-evidence.d.ts.map