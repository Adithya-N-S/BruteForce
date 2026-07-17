import { describe, it, expect } from 'vitest';
import { scoreEvidence, DEFAULT_WEIGHTS } from '../src/algorithms/score-evidence.js';
import type { EvidenceEdge } from '../src/types.js';

describe('scoreEvidence', () => {
  const EVAL_DATE = '2026-01-01T00:00:00Z';

  it('computes high score for recent, Tier 1 registry data', () => {
    const edge: EvidenceEdge = {
      id: 'edge-1',
      from: 'node-A',
      to: 'node-B',
      type: 'director_of',
      source_dataset: 'registry',
      record_id: 'rec-1',
      extraction_method: 'registry_filing',
      reliability_tier: 1,
      observed_date: '2025-06-01T00:00:00Z',
    };

    const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
    // Dataset: registry (0.9 * 0.2 = 0.18)
    // Tier: 1 (1.0 * 0.3 = 0.3)
    // Recency: < 1 year (1.0 * 0.2 = 0.2)
    // Completeness: 2/2 fields (1.0 * 0.1 = 0.1)
    // Provenance: registry_filing (1.0 * 0.2 = 0.2)
    // Total = 0.18 + 0.3 + 0.2 + 0.1 + 0.2 = 0.98
    expect(result.score).toBeCloseTo(0.98, 2);
    expect(result.level).toBe('high');
    expect(result.explanation).toContain('confidence');
  });

  it('computes medium score for older trade data', () => {
    const edge: EvidenceEdge = {
      id: 'edge-2',
      from: 'node-A',
      to: 'node-B',
      type: 'shipper_on',
      source_dataset: 'trade',
      record_id: 'rec-2',
      extraction_method: 'bill_of_lading_field',
      reliability_tier: 2,
      observed_date: '2022-01-01T00:00:00Z',
    };

    const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
    // Dataset: trade (0.7 * 0.2 = 0.14)
    // Tier: 2 (0.7 * 0.3 = 0.21)
    // Recency: 4 years old (0.6 * 0.2 = 0.12)
    // Completeness: 2/2 (1.0 * 0.1 = 0.1)
    // Provenance: bill_of_lading (0.8 * 0.2 = 0.16)
    // Total = 0.14 + 0.21 + 0.12 + 0.1 + 0.16 = 0.73
    expect(result.score).toBeCloseTo(0.73, 2);
    expect(result.level).toBe('medium');
  });

  it('computes low score for incomplete synthetic data', () => {
    const edge: EvidenceEdge = {
      id: 'edge-3',
      from: 'node-A',
      to: 'node-B',
      type: 'owns_pct',
      // missing value for owns_pct hurts completeness
      source_dataset: 'synthetic',
      record_id: 'rec-3',
      extraction_method: 'co_consignee_derivation',
      reliability_tier: 3,
      // missing observed_date hurts recency and completeness
    };

    const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
    // Dataset: synthetic (0.5 * 0.2 = 0.1)
    // Tier: 3 (0.4 * 0.3 = 0.12)
    // Recency: missing defaults to 0.5 (0.5 * 0.2 = 0.1)
    // Completeness: 1/3 fields expected (0.333 * 0.1 = 0.033)
    // Provenance: co_consignee (0.5 * 0.2 = 0.1)
    // Total = 0.1 + 0.12 + 0.1 + 0.033 + 0.1 = 0.453
    expect(result.score).toBeLessThan(0.5);
    expect(result.level).toBe('low');
  });

  it('allows custom weights', () => {
    const edge: EvidenceEdge = {
      id: 'edge-4',
      from: 'node-A',
      to: 'node-B',
      type: 'agent_for',
      source_dataset: 'registry',
      record_id: 'rec-4',
      extraction_method: 'registry_filing',
      reliability_tier: 1,
    };

    const customWeights = {
      dataset: 0.0,
      reliability: 1.0, // Only care about reliability
      recency: 0.0,
      completeness: 0.0,
      provenance: 0.0,
    };

    const result = scoreEvidence(edge, customWeights, EVAL_DATE);
    expect(result.score).toBe(1.0); // Tier 1 -> 1.0
  });

  it('awards higher provenance and completeness for entity_resolution with match_rule', () => {
    const edgeBase: EvidenceEdge = {
      id: 'edge-5',
      from: 'node-A',
      to: 'node-B',
      type: 'same_as',
      source_dataset: 'opensanctions',
      record_id: 'rec-5',
      extraction_method: 'entity_resolution',
      reliability_tier: 2,
    };

    const withoutRule = scoreEvidence(edgeBase, DEFAULT_WEIGHTS, EVAL_DATE);
    
    const edgeWithRule = { ...edgeBase, match_rule: 'exact' };
    const withRule = scoreEvidence(edgeWithRule, DEFAULT_WEIGHTS, EVAL_DATE);

    expect(withRule.score).toBeGreaterThan(withoutRule.score);
  });
});
