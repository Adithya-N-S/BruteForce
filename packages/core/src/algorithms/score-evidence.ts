import { EvidenceEdge, ConfidenceBand } from '../types.js';

export interface ScoreWeights {
  dataset: number;
  reliability: number;
  recency: number;
  completeness: number;
  provenance: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  dataset: 0.2,
  reliability: 0.3,
  recency: 0.2,
  completeness: 0.1,
  provenance: 0.2,
};

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
export function scoreEvidence(
  edge: EvidenceEdge,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  evaluationDate: string = '2026-01-01T00:00:00Z'
): ScoreEvidenceResult {
  const explanations: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // 1. Dataset Score
  let datasetScore = 0;
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

  // 2. Reliability Tier Score
  let reliabilityScore = 0;
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
      reliabilityScore = 0.4; // Fallback
  }
  totalScore += reliabilityScore * weights.reliability;
  totalWeight += weights.reliability;
  explanations.push(`reliability tier ${edge.reliability_tier} (score: ${reliabilityScore})`);

  // 3. Recency Score
  let recencyScore = 0.5; // Default if no observed_date is present
  if (edge.observed_date) {
    const obsDate = new Date(edge.observed_date).getTime();
    const evalDate = new Date(evaluationDate).getTime();
    
    if (!isNaN(obsDate) && !isNaN(evalDate)) {
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const yearsDiff = Math.max(0, (evalDate - obsDate) / msPerYear);

      if (yearsDiff <= 1) {
        recencyScore = 1.0;
      } else if (yearsDiff <= 3) {
        recencyScore = 0.8;
      } else if (yearsDiff <= 5) {
        recencyScore = 0.6;
      } else {
        recencyScore = 0.3; // Very old data
      }
    }
  }
  totalScore += recencyScore * weights.recency;
  totalWeight += weights.recency;
  explanations.push(`recency ${edge.observed_date ? edge.observed_date : 'unknown'} (score: ${recencyScore})`);

  // 4. Completeness Score
  let completenessScore = 1.0;
  let expectedFields = 1; // Always expect basic edge structure
  let presentFields = 1;

  // We consider observed_date as a completeness indicator
  expectedFields++;
  if (edge.observed_date) presentFields++;

  // We consider value as an indicator if the edge is of type owns_pct
  if (edge.type === 'owns_pct') {
    expectedFields++;
    if (edge.value !== undefined) presentFields++;
  }

  // We consider match_rule as an indicator if extraction is entity_resolution
  if (edge.extraction_method === 'entity_resolution') {
    expectedFields++;
    if (edge.match_rule !== undefined) presentFields++;
  }

  completenessScore = presentFields / expectedFields;
  
  totalScore += completenessScore * weights.completeness;
  totalWeight += weights.completeness;
  explanations.push(`completeness ${presentFields}/${expectedFields} (score: ${completenessScore.toFixed(2)})`);

  // 5. Provenance Score
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

  // Final Calculation
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  // Round to 3 decimal places to avoid floating point weirdness
  const roundedScore = Math.round(finalScore * 1000) / 1000;

  let level: ConfidenceBand;
  if (roundedScore >= 0.85) {
    level = 'high';
  } else if (roundedScore >= 0.65) {
    level = 'medium';
  } else {
    level = 'low';
  }

  const explanation = `Evidence scored ${roundedScore.toFixed(2)} (${level} confidence). Breakdown: ` + explanations.join(', ') + '.';

  return {
    score: roundedScore,
    level,
    explanation,
  };
}
