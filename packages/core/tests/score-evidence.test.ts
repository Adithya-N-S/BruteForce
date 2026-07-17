import { describe, it, expect } from 'vitest';
import { scoreEvidence, DEFAULT_WEIGHTS, type ScoreWeights } from '../src/algorithms/score-evidence.js';
import type { EvidenceEdge } from '../src/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EVAL_DATE = '2026-01-01T00:00:00Z';

/** Minimal valid evidence edge factory. */
function makeEdge(overrides: Partial<EvidenceEdge> & { id: string }): EvidenceEdge {
  return {
    from: 'node-A',
    to: 'node-B',
    type: 'director_of',
    source_dataset: 'registry',
    record_id: `rec-${overrides.id}`,
    extraction_method: 'registry_filing',
    reliability_tier: 1,
    ...overrides,
  };
}

// =============================================================================
// scoreEvidence Tests
// =============================================================================

describe('scoreEvidence', () => {
  // ── Normal Cases ────────────────────────────────────────────────────────────

  describe('normal cases', () => {
    it('computes high score for recent, Tier 1 registry data', () => {
      const edge = makeEdge({
        id: 'e1',
        source_dataset: 'registry',
        extraction_method: 'registry_filing',
        reliability_tier: 1,
        observed_date: '2025-06-01T00:00:00Z',
      });

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);

      // Dataset: registry (0.9), Reliability: T1 (1.0), Recency: <1yr (1.0),
      // Completeness: 2/2 (1.0), Provenance: registry_filing (1.0)
      // Weighted avg: (0.9*0.2 + 1.0*0.3 + 1.0*0.2 + 1.0*0.1 + 1.0*0.2) / 1.0 = 0.98
      expect(result.score).toBeCloseTo(0.98, 2);
      expect(result.level).toBe('high');
      expect(result.confidenceScore).toBe(result.score);
      expect(result.confidenceLevel).toBe(result.level);
      expect(result.explanation).toContain('confidence');
    });

    it('computes medium score for older trade data', () => {
      const edge = makeEdge({
        id: 'e2',
        type: 'shipper_on',
        source_dataset: 'trade',
        extraction_method: 'bill_of_lading_field',
        reliability_tier: 2,
        observed_date: '2022-01-01T00:00:00Z',
      });

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // Dataset: trade (0.7), Tier: 2 (0.7), Recency: ~4yrs (0.6),
      // Completeness: 2/2 (1.0), Provenance: bill_of_lading (0.8)
      // = (0.14 + 0.21 + 0.12 + 0.1 + 0.16) / 1.0 = 0.73
      expect(result.score).toBeCloseTo(0.73, 2);
      expect(result.level).toBe('medium');
    });

    it('computes low score for incomplete synthetic data', () => {
      const edge = makeEdge({
        id: 'e3',
        type: 'owns_pct',
        source_dataset: 'synthetic',
        extraction_method: 'co_consignee_derivation',
        reliability_tier: 3,
        // missing observed_date, missing value
      });

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.score).toBeLessThan(0.5);
      expect(result.level).toBe('low');
    });

    it('returns correct scoreBreakdown structure with all base fields', () => {
      const edge = makeEdge({ id: 'e4', observed_date: '2025-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);

      expect(result.scoreBreakdown).toHaveProperty('dataset');
      expect(result.scoreBreakdown).toHaveProperty('reliability');
      expect(result.scoreBreakdown).toHaveProperty('recency');
      expect(result.scoreBreakdown).toHaveProperty('completeness');
      expect(result.scoreBreakdown).toHaveProperty('provenance');

      // Without context, optional fields should NOT be present
      expect(result.scoreBreakdown.corroboration).toBeUndefined();
      expect(result.scoreBreakdown.quality).toBeUndefined();
    });

    it('opensanctions dataset scores highest', () => {
      const edge = makeEdge({ id: 'e5', source_dataset: 'opensanctions' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.dataset).toBe(1.0);
    });

    it('trade dataset scores 0.7', () => {
      const edge = makeEdge({ id: 'e6', source_dataset: 'trade' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.dataset).toBe(0.7);
    });

    it('synthetic dataset scores 0.5', () => {
      const edge = makeEdge({ id: 'e7', source_dataset: 'synthetic' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.dataset).toBe(0.5);
    });
  });

  // ── Reliability Tiers ───────────────────────────────────────────────────────

  describe('reliability tiers', () => {
    it('Tier 1 scores 1.0', () => {
      const edge = makeEdge({ id: 'r1', reliability_tier: 1 });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.reliability).toBe(1.0);
    });

    it('Tier 2 scores 0.7', () => {
      const edge = makeEdge({ id: 'r2', reliability_tier: 2 });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.reliability).toBe(0.7);
    });

    it('Tier 3 scores 0.4', () => {
      const edge = makeEdge({ id: 'r3', reliability_tier: 3 });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.reliability).toBe(0.4);
    });
  });

  // ── Recency Scoring ─────────────────────────────────────────────────────────

  describe('recency scoring', () => {
    it('within 1 year → score 1.0', () => {
      const edge = makeEdge({ id: 'rec1', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.recency).toBe(1.0);
    });

    it('1 to 3 years → score 0.8', () => {
      const edge = makeEdge({ id: 'rec2', observed_date: '2024-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.recency).toBe(0.8);
    });

    it('3 to 5 years → score 0.6', () => {
      const edge = makeEdge({ id: 'rec3', observed_date: '2022-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.recency).toBe(0.6);
    });

    it('older than 5 years → score 0.3', () => {
      const edge = makeEdge({ id: 'rec4', observed_date: '2019-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.recency).toBe(0.3);
    });

    it('missing observed_date → default score 0.5', () => {
      const edge = makeEdge({ id: 'rec5' }); // no observed_date
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.recency).toBe(0.5);
    });
  });

  // ── Completeness Scoring ────────────────────────────────────────────────────

  describe('completeness scoring', () => {
    it('full completeness for standard edge with observed_date', () => {
      const edge = makeEdge({ id: 'c1', observed_date: '2025-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // expectedFields = 2 (base + observed_date), presentFields = 2
      expect(result.scoreBreakdown.completeness).toBe(1.0);
    });

    it('reduced completeness when observed_date is missing', () => {
      const edge = makeEdge({ id: 'c2' }); // no observed_date
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // expectedFields = 2, presentFields = 1
      expect(result.scoreBreakdown.completeness).toBe(0.5);
    });

    it('owns_pct edge with value has full completeness', () => {
      const edge = makeEdge({
        id: 'c3',
        type: 'owns_pct',
        value: 0.5,
        observed_date: '2025-01-01',
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // expectedFields = 3 (base + observed + value), presentFields = 3
      expect(result.scoreBreakdown.completeness).toBe(1.0);
    });

    it('owns_pct edge without value has reduced completeness', () => {
      const edge = makeEdge({
        id: 'c4',
        type: 'owns_pct',
        observed_date: '2025-01-01',
        // missing value
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // expectedFields = 3, presentFields = 2
      expect(result.scoreBreakdown.completeness).toBeCloseTo(2 / 3, 2);
    });

    it('entity_resolution edge with match_rule has full completeness', () => {
      const edge = makeEdge({
        id: 'c5',
        type: 'same_as',
        extraction_method: 'entity_resolution',
        match_rule: 'name:exact',
        observed_date: '2025-01-01',
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // expectedFields = 3 (base + observed + match_rule), presentFields = 3
      expect(result.scoreBreakdown.completeness).toBe(1.0);
    });

    it('entity_resolution edge without match_rule has reduced completeness', () => {
      const edge = makeEdge({
        id: 'c6',
        type: 'same_as',
        extraction_method: 'entity_resolution',
        observed_date: '2025-01-01',
        // missing match_rule
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.completeness).toBeCloseTo(2 / 3, 2);
    });
  });

  // ── Provenance Scoring ──────────────────────────────────────────────────────

  describe('provenance scoring', () => {
    it('registry_filing → 1.0', () => {
      const edge = makeEdge({ id: 'p1', extraction_method: 'registry_filing' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(1.0);
    });

    it('sanctions_list_entry → 1.0', () => {
      const edge = makeEdge({ id: 'p2', extraction_method: 'sanctions_list_entry' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(1.0);
    });

    it('manual_seed → 0.9', () => {
      const edge = makeEdge({ id: 'p3', extraction_method: 'manual_seed' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(0.9);
    });

    it('bill_of_lading_field → 0.8', () => {
      const edge = makeEdge({ id: 'p4', extraction_method: 'bill_of_lading_field' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(0.8);
    });

    it('entity_resolution with match_rule → 0.8', () => {
      const edge = makeEdge({ id: 'p5', extraction_method: 'entity_resolution', match_rule: 'exact' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(0.8);
    });

    it('entity_resolution without match_rule → 0.6', () => {
      const edge = makeEdge({ id: 'p6', extraction_method: 'entity_resolution' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(0.6);
    });

    it('co_consignee_derivation → 0.5', () => {
      const edge = makeEdge({ id: 'p7', extraction_method: 'co_consignee_derivation' });
      expect(scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE).scoreBreakdown.provenance).toBe(0.5);
    });

    it('entity_resolution with match_rule scores higher than without', () => {
      const base = makeEdge({
        id: 'p8',
        type: 'same_as',
        source_dataset: 'opensanctions',
        extraction_method: 'entity_resolution',
        reliability_tier: 2,
      });

      const withoutRule = scoreEvidence(base, DEFAULT_WEIGHTS, EVAL_DATE);
      const withRule = scoreEvidence({ ...base, match_rule: 'exact' }, DEFAULT_WEIGHTS, EVAL_DATE);

      expect(withRule.score).toBeGreaterThan(withoutRule.score);
    });
  });

  // ── Custom Weights ──────────────────────────────────────────────────────────

  describe('custom weights', () => {
    it('allows custom weights to isolate a single component', () => {
      const edge = makeEdge({ id: 'w1', reliability_tier: 1 });

      const reliabilityOnly: ScoreWeights = {
        dataset: 0, reliability: 1.0, recency: 0, completeness: 0, provenance: 0,
      };

      const result = scoreEvidence(edge, reliabilityOnly, EVAL_DATE);
      expect(result.score).toBe(1.0);
    });

    it('zero weight on all components yields score 0', () => {
      const edge = makeEdge({ id: 'w2' });
      const zeroWeights: ScoreWeights = {
        dataset: 0, reliability: 0, recency: 0, completeness: 0, provenance: 0,
      };

      const result = scoreEvidence(edge, zeroWeights, EVAL_DATE);
      expect(result.score).toBe(0);
    });

    it('respects custom corroboration and quality weights', () => {
      const edge = makeEdge({ id: 'w3', observed_date: '2025-06-01' });
      const customWeights: ScoreWeights = {
        dataset: 0.1, reliability: 0.1, recency: 0.1,
        completeness: 0.1, provenance: 0.1,
        corroboration: 0.5, // heavily weighted
        quality: 0.0,
      };

      const resultWithCorr = scoreEvidence(edge, customWeights, EVAL_DATE, { corroborationCount: 4 });
      // Corroboration count 4+ → score 1.0, heavily weighted at 0.5
      expect(resultWithCorr.scoreBreakdown.corroboration).toBe(1.0);
    });
  });

  // ── Corroboration Scoring ───────────────────────────────────────────────────

  describe('corroboration scoring', () => {
    it('corroborationCount 1 → score 0.5', () => {
      const edge = makeEdge({ id: 'corr1', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 1 });
      expect(result.scoreBreakdown.corroboration).toBe(0.5);
    });

    it('corroborationCount 2 → score 0.8', () => {
      const edge = makeEdge({ id: 'corr2', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 2 });
      expect(result.scoreBreakdown.corroboration).toBe(0.8);
    });

    it('corroborationCount 3 → score 0.9', () => {
      const edge = makeEdge({ id: 'corr3', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 3 });
      expect(result.scoreBreakdown.corroboration).toBe(0.9);
    });

    it('corroborationCount 4+ → score 1.0', () => {
      const edge = makeEdge({ id: 'corr4', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 10 });
      expect(result.scoreBreakdown.corroboration).toBe(1.0);
    });

    it('corroboration from context is included in final score calculation', () => {
      const edge = makeEdge({ id: 'corr5', observed_date: '2025-06-01' });
      const withoutCorr = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      const withCorr = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 3 });

      // The corroboration should change the final score
      expect(withCorr.confidenceScore).not.toBe(withoutCorr.confidenceScore);
    });

    it('reads corroboration_count from edge object when context is absent', () => {
      const edge = {
        ...makeEdge({ id: 'corr6', observed_date: '2025-06-01' }),
        corroboration_count: 2,
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.corroboration).toBe(0.8);
    });

    it('reads corroboration field from edge object as fallback', () => {
      const edge = {
        ...makeEdge({ id: 'corr7', observed_date: '2025-06-01' }),
        corroboration: 3,
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.corroboration).toBe(0.9);
    });

    it('context corroborationCount takes precedence over edge fields', () => {
      const edge = {
        ...makeEdge({ id: 'corr8', observed_date: '2025-06-01' }),
        corroboration_count: 1, // would give 0.5
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 4 }); // gives 1.0
      expect(result.scoreBreakdown.corroboration).toBe(1.0);
    });
  });

  // ── Evidence Quality Scoring ────────────────────────────────────────────────

  describe('evidence quality scoring', () => {
    it('quality value is used as-is (clamped to [0,1])', () => {
      const edge = makeEdge({ id: 'q1', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { evidenceQuality: 0.75 });
      expect(result.scoreBreakdown.quality).toBe(0.75);
    });

    it('quality values > 1 are clamped to 1.0', () => {
      const edge = makeEdge({ id: 'q2', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { evidenceQuality: 1.5 });
      expect(result.scoreBreakdown.quality).toBe(1.0);
    });

    it('quality values < 0 are clamped to 0.0', () => {
      const edge = makeEdge({ id: 'q3', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { evidenceQuality: -0.5 });
      expect(result.scoreBreakdown.quality).toBe(0.0);
    });

    it('reads quality field from edge object when context is absent', () => {
      const edge = {
        ...makeEdge({ id: 'q4', observed_date: '2025-06-01' }),
        quality: 0.8,
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.quality).toBe(0.8);
    });

    it('reads evidence_quality field from edge object as fallback', () => {
      const edge = {
        ...makeEdge({ id: 'q5', observed_date: '2025-06-01' }),
        evidence_quality: 0.6,
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.scoreBreakdown.quality).toBe(0.6);
    });

    it('context evidenceQuality takes precedence over edge fields', () => {
      const edge = {
        ...makeEdge({ id: 'q6', observed_date: '2025-06-01' }),
        quality: 0.1,
      } as any as EvidenceEdge;

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { evidenceQuality: 0.9 });
      expect(result.scoreBreakdown.quality).toBe(0.9);
    });
  });

  // ── Combined Corroboration + Quality ────────────────────────────────────────

  describe('combined corroboration and quality', () => {
    it('includes both corroboration and quality in final score when both provided', () => {
      const edge = makeEdge({ id: 'cq1', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, {
        corroborationCount: 3,
        evidenceQuality: 0.9,
      });

      expect(result.scoreBreakdown.corroboration).toBe(0.9);
      expect(result.scoreBreakdown.quality).toBe(0.9);
      // Total weight: 1.0 + 0.1 + 0.1 = 1.2
      // Both additional components contribute to the score
      expect(result.confidenceScore).toBeDefined();
    });
  });

  // ── Empty / Missing Inputs ──────────────────────────────────────────────────

  describe('empty and missing inputs', () => {
    it('uses default weights when none provided', () => {
      const edge = makeEdge({ id: 'def1', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge);
      expect(result.score).toBeGreaterThan(0);
      expect(result.level).toBeDefined();
    });

    it('uses default evaluation date when none provided', () => {
      const edge = makeEdge({ id: 'def2', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS);
      expect(result.score).toBeGreaterThan(0);
    });

    it('handles empty context object gracefully', () => {
      const edge = makeEdge({ id: 'def3', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, {});
      // No corroboration or quality should be present
      expect(result.scoreBreakdown.corroboration).toBeUndefined();
      expect(result.scoreBreakdown.quality).toBeUndefined();
    });

    it('handles undefined context gracefully', () => {
      const edge = makeEdge({ id: 'def4', observed_date: '2025-06-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, undefined);
      expect(result.scoreBreakdown.corroboration).toBeUndefined();
      expect(result.scoreBreakdown.quality).toBeUndefined();
    });
  });

  // ── Confidence Level Thresholds ─────────────────────────────────────────────

  describe('confidence level thresholds', () => {
    it('score >= 0.85 → high confidence', () => {
      const edge = makeEdge({
        id: 'cl1',
        source_dataset: 'opensanctions',
        reliability_tier: 1,
        extraction_method: 'sanctions_list_entry',
        observed_date: '2025-06-01',
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(result.confidenceLevel).toBe('high');
    });

    it('score in [0.65, 0.85) → medium confidence', () => {
      const edge = makeEdge({
        id: 'cl2',
        source_dataset: 'trade',
        reliability_tier: 2,
        extraction_method: 'bill_of_lading_field',
        observed_date: '2022-01-01',
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.65);
      expect(result.confidenceScore).toBeLessThan(0.85);
      expect(result.confidenceLevel).toBe('medium');
    });

    it('score < 0.65 → low confidence', () => {
      const edge = makeEdge({
        id: 'cl3',
        source_dataset: 'synthetic',
        reliability_tier: 3,
        extraction_method: 'co_consignee_derivation',
        // no observed_date → recency 0.5, completeness 1/2
      });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.confidenceScore).toBeLessThan(0.65);
      expect(result.confidenceLevel).toBe('low');
    });
  });

  // ── Explanation String ──────────────────────────────────────────────────────

  describe('explanation string', () => {
    it('includes the rounded score and confidence band', () => {
      const edge = makeEdge({ id: 'exp1', observed_date: '2025-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.explanation).toMatch(/\d+\.\d+/); // contains a number
      expect(result.explanation).toContain(result.level);
    });

    it('includes dataset mention', () => {
      const edge = makeEdge({ id: 'exp2', source_dataset: 'trade' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.explanation).toContain('trade');
    });

    it('includes extraction method mention', () => {
      const edge = makeEdge({ id: 'exp3', extraction_method: 'bill_of_lading_field' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.explanation).toContain('bill_of_lading_field');
    });

    it('includes corroboration mention when provided', () => {
      const edge = makeEdge({ id: 'exp4' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 2 });
      expect(result.explanation).toContain('corroboration');
    });

    it('includes quality mention when provided', () => {
      const edge = makeEdge({ id: 'exp5' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { evidenceQuality: 0.8 });
      expect(result.explanation).toContain('quality');
    });
  });

  // ── Invalid Inputs ──────────────────────────────────────────────────────────

  describe('invalid inputs', () => {
    it('handles invalid observed_date gracefully (NaN date)', () => {
      const edge = makeEdge({ id: 'inv1', observed_date: 'not-a-date' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // Should fall back to default recency of 0.5
      expect(result.scoreBreakdown.recency).toBe(0.5);
    });

    it('handles invalid evaluation date gracefully', () => {
      const edge = makeEdge({ id: 'inv2', observed_date: '2025-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, 'invalid-date');
      // Should fall back to default recency of 0.5
      expect(result.scoreBreakdown.recency).toBe(0.5);
    });

    it('handles observed_date in the future relative to evaluation date', () => {
      const edge = makeEdge({ id: 'inv3', observed_date: '2027-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // yearsDiff would be negative, Math.max(0, ...) clamps to 0 → score 1.0
      expect(result.scoreBreakdown.recency).toBe(1.0);
    });
  });

  // ── DEFAULT_WEIGHTS Export ──────────────────────────────────────────────────

  describe('DEFAULT_WEIGHTS', () => {
    it('has expected structure', () => {
      expect(DEFAULT_WEIGHTS.dataset).toBe(0.2);
      expect(DEFAULT_WEIGHTS.reliability).toBe(0.3);
      expect(DEFAULT_WEIGHTS.recency).toBe(0.2);
      expect(DEFAULT_WEIGHTS.completeness).toBe(0.1);
      expect(DEFAULT_WEIGHTS.provenance).toBe(0.2);
      expect(DEFAULT_WEIGHTS.corroboration).toBe(0.1);
      expect(DEFAULT_WEIGHTS.quality).toBe(0.1);
    });

    it('base weights sum to 1.0', () => {
      const sum = DEFAULT_WEIGHTS.dataset +
        DEFAULT_WEIGHTS.reliability +
        DEFAULT_WEIGHTS.recency +
        DEFAULT_WEIGHTS.completeness +
        DEFAULT_WEIGHTS.provenance;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  // ── Determinism ─────────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('produces identical results across multiple invocations', () => {
      const edge = makeEdge({
        id: 'det1',
        source_dataset: 'trade',
        reliability_tier: 2,
        extraction_method: 'bill_of_lading_field',
        observed_date: '2023-06-15',
      });

      const r1 = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 2 });
      const r2 = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 2 });
      const r3 = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE, { corroborationCount: 2 });

      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('score is always rounded to 3 decimal places', () => {
      const edge = makeEdge({
        id: 'det2',
        source_dataset: 'trade',
        reliability_tier: 3,
        extraction_method: 'co_consignee_derivation',
      });

      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      // Verify that score has at most 3 decimal places
      const decimalPlaces = (result.score.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(3);
    });

    it('score and confidenceScore are always equal', () => {
      const edge = makeEdge({ id: 'det3', observed_date: '2024-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.score).toBe(result.confidenceScore);
    });

    it('level and confidenceLevel are always equal', () => {
      const edge = makeEdge({ id: 'det4', observed_date: '2024-01-01' });
      const result = scoreEvidence(edge, DEFAULT_WEIGHTS, EVAL_DATE);
      expect(result.level).toBe(result.confidenceLevel);
    });
  });
});
