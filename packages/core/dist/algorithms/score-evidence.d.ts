/**
 * @module score-evidence
 * @description
 * Deterministically scores an evidence edge based on its attributes and metadata.
 *
 * The score is a weighted average of up to 7 components:
 * 1. **Dataset**: Base quality of the source dataset.
 * 2. **Reliability**: The reliability tier (1, 2, 3) of the source.
 * 3. **Recency**: How recently the record was observed (decays over time).
 * 4. **Completeness**: Presence of optional but valuable fields.
 * 5. **Provenance**: Confidence in the extraction method.
 * 6. **Corroboration**: Additional supporting sources or evidence count (optional).
 * 7. **Quality**: General qualitative assessment or evidence quality (optional).
 *
 * If optional components (Corroboration, Quality) are not provided in the input
 * edge or context, they are omitted from both the score and weight sums to maintain
 * backward compatibility and correct scaling.
 */
import type { EvidenceEdge, ConfidenceBand } from '../types.js';
/**
 * Configurable weighting constants for each scoring component.
 * Higher values contribute more to the overall match confidence.
 */
export interface ScoreWeights {
    readonly dataset: number;
    readonly reliability: number;
    readonly recency: number;
    readonly completeness: number;
    readonly provenance: number;
    readonly corroboration?: number;
    readonly quality?: number;
}
/**
 * Default weights configured for VEILBREAKER evidence scoring.
 */
export declare const DEFAULT_WEIGHTS: ScoreWeights;
/**
 * Detailed breakdown of individual score components.
 * Values are between 0 and 1.
 */
export interface ScoreBreakdown {
    readonly dataset: number;
    readonly reliability: number;
    readonly recency: number;
    readonly completeness: number;
    readonly provenance: number;
    readonly corroboration?: number;
    readonly quality?: number;
}
/**
 * Complete result of the scoreEvidence algorithm.
 */
export interface ScoreEvidenceResult {
    /** The final aggregated score in [0, 1]. Identical to confidenceScore. */
    readonly score: number;
    /** Categorical confidence band. Identical to confidenceLevel. */
    readonly level: ConfidenceBand;
    /** A human-readable description of why this score was assigned. */
    readonly explanation: string;
    /** The final aggregated score in [0, 1]. */
    readonly confidenceScore: number;
    /** Categorical confidence band ('high', 'medium', or 'low'). */
    readonly confidenceLevel: ConfidenceBand;
    /** Individual component scores used to compute the final score. */
    readonly scoreBreakdown: ScoreBreakdown;
}
/**
 * Deterministically scores an evidence edge based on its attributes.
 *
 * ## Usage
 * ```ts
 * import { scoreEvidence } from './score-evidence.js';
 *
 * const result = scoreEvidence(edge, DEFAULT_WEIGHTS, '2026-01-01T00:00:00Z', {
 *   corroborationCount: 2,
 *   evidenceQuality: 0.9
 * });
 * console.log(result.confidenceScore, result.confidenceLevel, result.scoreBreakdown);
 * ```
 *
 * @param edge - The evidence edge to score.
 * @param weights - Configurable weights for the scoring components.
 * @param evaluationDate - ISO 8601 date string to use as "now" for recency calculations.
 * @param context - Optional extra contextual metadata for scoring (corroboration, quality).
 * @returns A {@link ScoreEvidenceResult} containing score, level, and breakdown.
 */
export declare function scoreEvidence(edge: EvidenceEdge, weights?: ScoreWeights, evaluationDate?: string, context?: {
    readonly corroborationCount?: number;
    readonly evidenceQuality?: number;
}): ScoreEvidenceResult;
//# sourceMappingURL=score-evidence.d.ts.map