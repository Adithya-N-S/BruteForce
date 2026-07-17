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

// ─────────────────────────────────────────────────────────────────────────────
// Public Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

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
export const DEFAULT_WEIGHTS: ScoreWeights = {
  dataset: 0.2,
  reliability: 0.3,
  recency: 0.2,
  completeness: 0.1,
  provenance: 0.2,
  corroboration: 0.1,
  quality: 0.1,
};

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

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the recency score based on the years difference from evaluation date.
 *
 * @param yearsDiff - Number of years between observation and evaluation.
 * @returns Recency score in [0.3, 1.0].
 *
 * @internal
 */
function calculateRecencyScore(yearsDiff: number): number {
  if (yearsDiff <= 1) return 1.0;
  if (yearsDiff <= 3) return 0.8;
  if (yearsDiff <= 5) return 0.6;
  return 0.3; // Very old data
}

/**
 * Computes the corroboration score based on additional supporting record counts.
 *
 * @param count - The corroboration/supporting source count.
 * @returns Corroboration score in [0.5, 1.0].
 *
 * @internal
 */
function calculateCorroborationScore(count: number): number {
  if (count <= 1) return 0.5;
  if (count === 2) return 0.8;
  if (count === 3) return 0.9;
  return 1.0; // 4 or more corroborating sources
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

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
export function scoreEvidence(
  edge: EvidenceEdge,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  evaluationDate: string = '2026-01-01T00:00:00Z',
  context?: {
    readonly corroborationCount?: number;
    readonly evidenceQuality?: number;
  }
): ScoreEvidenceResult {
  const explanations: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // ── 1. Dataset Score ──────────────────────────────────────────────────────
  let datasetScore = 0.5;
  switch (edge.source_dataset) {
    case 'opensanctions':
      datasetScore = 1.0;
      break;
    case 'registry':
      datasetScore = 0.9;
      break;
    case 'trade':
      datasetScore = 0.7;
      break;
    case 'synthetic':
      datasetScore = 0.5;
      break;
    default:
      datasetScore = 0.5;
  }
  totalScore += datasetScore * weights.dataset;
  totalWeight += weights.dataset;
  explanations.push(`dataset '${edge.source_dataset}' (score: ${datasetScore})`);

  // ── 2. Reliability Tier Score ─────────────────────────────────────────────
  let reliabilityScore = 0.4;
  switch (edge.reliability_tier) {
    case 1:
      reliabilityScore = 1.0;
      break;
    case 2:
      reliabilityScore = 0.7;
      break;
    case 3:
      reliabilityScore = 0.4;
      break;
    default:
      reliabilityScore = 0.4;
  }
  totalScore += reliabilityScore * weights.reliability;
  totalWeight += weights.reliability;
  explanations.push(`reliability tier ${edge.reliability_tier} (score: ${reliabilityScore})`);

  // ── 3. Recency Score ──────────────────────────────────────────────────────
  let recencyScore = 0.5;
  if (edge.observed_date) {
    const obsDate = new Date(edge.observed_date).getTime();
    const evalDate = new Date(evaluationDate).getTime();

    if (!isNaN(obsDate) && !isNaN(evalDate)) {
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const yearsDiff = Math.max(0, (evalDate - obsDate) / msPerYear);
      recencyScore = calculateRecencyScore(yearsDiff);
    }
  }
  totalScore += recencyScore * weights.recency;
  totalWeight += weights.recency;
  explanations.push(
    `recency ${edge.observed_date ? edge.observed_date : 'unknown'} (score: ${recencyScore})`
  );

  // ── 4. Completeness Score ─────────────────────────────────────────────────
  let completenessScore = 1.0;
  let expectedFields = 1;
  let presentFields = 1;

  expectedFields++;
  if (edge.observed_date) presentFields++;

  if (edge.type === 'owns_pct') {
    expectedFields++;
    if (edge.value !== undefined) presentFields++;
  }

  if (edge.extraction_method === 'entity_resolution') {
    expectedFields++;
    if (edge.match_rule !== undefined) presentFields++;
  }

  completenessScore = presentFields / expectedFields;
  totalScore += completenessScore * weights.completeness;
  totalWeight += weights.completeness;
  explanations.push(
    `completeness ${presentFields}/${expectedFields} (score: ${completenessScore.toFixed(2)})`
  );

  // ── 5. Provenance Score ───────────────────────────────────────────────────
  let provenanceScore = 0.5;
  switch (edge.extraction_method) {
    case 'registry_filing':
    case 'sanctions_list_entry':
      provenanceScore = 1.0;
      break;
    case 'manual_seed':
      provenanceScore = 0.9;
      break;
    case 'bill_of_lading_field':
      provenanceScore = 0.8;
      break;
    case 'entity_resolution':
      provenanceScore = edge.match_rule ? 0.8 : 0.6;
      break;
    case 'co_consignee_derivation':
      provenanceScore = 0.5;
      break;
    default:
      provenanceScore = 0.5;
  }
  totalScore += provenanceScore * weights.provenance;
  totalWeight += weights.provenance;
  explanations.push(`provenance '${edge.extraction_method}' (score: ${provenanceScore})`);

  // ── 6. Corroboration Score (Optional) ─────────────────────────────────────
  let corroborationScore: number | undefined;
  let finalCorroborationWeight = 0;

  let rawCorroborationCount: number | undefined;
  if (context?.corroborationCount !== undefined) {
    rawCorroborationCount = context.corroborationCount;
  } else if ((edge as any).corroboration_count !== undefined) {
    rawCorroborationCount = Number((edge as any).corroboration_count);
  } else if ((edge as any).corroboration !== undefined) {
    rawCorroborationCount = Number((edge as any).corroboration);
  }

  if (rawCorroborationCount !== undefined) {
    corroborationScore = calculateCorroborationScore(rawCorroborationCount);
    finalCorroborationWeight = weights.corroboration ?? DEFAULT_WEIGHTS.corroboration ?? 0.1;
    totalScore += corroborationScore * finalCorroborationWeight;
    totalWeight += finalCorroborationWeight;
    explanations.push(`corroboration count ${rawCorroborationCount} (score: ${corroborationScore})`);
  }

  // ── 7. Evidence Quality Score (Optional) ──────────────────────────────────
  let qualityScore: number | undefined;
  let finalQualityWeight = 0;

  let rawEvidenceQuality: number | undefined;
  if (context?.evidenceQuality !== undefined) {
    rawEvidenceQuality = context.evidenceQuality;
  } else if ((edge as any).quality !== undefined) {
    rawEvidenceQuality = Number((edge as any).quality);
  } else if ((edge as any).evidence_quality !== undefined) {
    rawEvidenceQuality = Number((edge as any).evidence_quality);
  }

  if (rawEvidenceQuality !== undefined) {
    // Clamp to [0, 1] range to ensure determinism
    qualityScore = Math.max(0, Math.min(1, rawEvidenceQuality));
    finalQualityWeight = weights.quality ?? DEFAULT_WEIGHTS.quality ?? 0.1;
    totalScore += qualityScore * finalQualityWeight;
    totalWeight += finalQualityWeight;
    explanations.push(`evidence quality ${rawEvidenceQuality} (score: ${qualityScore})`);
  }

  // ── Final Confidence Calculation ──────────────────────────────────────────
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const roundedScore = Math.round(finalScore * 1000) / 1000;

  let level: ConfidenceBand;
  if (roundedScore >= 0.85) {
    level = 'high';
  } else if (roundedScore >= 0.65) {
    level = 'medium';
  } else {
    level = 'low';
  }

  const explanation =
    `Evidence scored ${roundedScore.toFixed(3)} (${level} confidence). Breakdown: ` +
    explanations.join(', ') +
    '.';

  return {
    score: roundedScore,
    level,
    explanation,
    confidenceScore: roundedScore,
    confidenceLevel: level,
    scoreBreakdown: {
      dataset: datasetScore,
      reliability: reliabilityScore,
      recency: recencyScore,
      completeness: completenessScore,
      provenance: provenanceScore,
      ...(corroborationScore !== undefined ? { corroboration: corroborationScore } : {}),
      ...(qualityScore !== undefined ? { quality: qualityScore } : {}),
    },
  };
}
