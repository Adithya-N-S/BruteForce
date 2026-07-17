import { describe, it, expect } from 'vitest';
import { GraphManager } from '../src/graph/graph-manager.js';
import {
  assembleDossier,
  type ComprehensiveDossier,
} from '../src/algorithms/assemble-dossier.js';
import type {
  EvidenceEdge,
  ResolveEntityResult,
  ComputeControlResult,
  ControlPath,
} from '../src/types.js';
import type { SharedAttributesResult } from '../src/algorithms/find-shared-attributes.js';
import type { CoConsigneeLinksResult } from '../src/algorithms/co-consignee-links.js';
import type { ScoreEvidenceResult } from '../src/algorithms/score-evidence.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a minimal valid EvidenceEdge. */
function makeEdge(overrides: Partial<EvidenceEdge> & { id: string }): EvidenceEdge {
  return {
    from: 'root',
    to: 'target',
    type: 'owns_pct',
    source_dataset: 'registry',
    record_id: `rec-${overrides.id}`,
    extraction_method: 'registry_filing',
    reliability_tier: 1,
    ...overrides,
  };
}

/** Creates a minimal valid ScoreEvidenceResult. */
function makeScoreResult(overrides: Partial<ScoreEvidenceResult> = {}): ScoreEvidenceResult {
  return {
    score: 0.9,
    level: 'high',
    explanation: 'Test explanation',
    confidenceScore: 0.9,
    confidenceLevel: 'high',
    scoreBreakdown: {
      dataset: 0.9,
      reliability: 1.0,
      recency: 1.0,
      completeness: 1.0,
      provenance: 1.0,
    },
    ...overrides,
  };
}

/** Creates a minimal valid ResolveEntityResult. */
function makeResolveResult(overrides: Partial<ResolveEntityResult> = {}): ResolveEntityResult {
  return {
    matches: [],
    ...overrides,
  };
}

/** Creates a minimal valid ComputeControlResult. */
function makeControlResult(overrides: Partial<ComputeControlResult> = {}): ComputeControlResult {
  return {
    effective_control: 0,
    meets_threshold: false,
    threshold: 0.25,
    contributing_paths: [],
    ...overrides,
  };
}

/** Creates a minimal valid SharedAttributesResult. */
function makeSharedAttrsResult(overrides: Partial<SharedAttributesResult> = {}): SharedAttributesResult {
  return {
    matches: [],
    ...overrides,
  };
}

/** Creates a minimal valid CoConsigneeLinksResult. */
function makeCoConsigneeResult(overrides: Partial<CoConsigneeLinksResult> = {}): CoConsigneeLinksResult {
  return {
    focalEntityId: 'root',
    totalFocalShipmentCount: 0,
    links: [],
    ...overrides,
  };
}

/** Convenience function to call assembleDossier in direct compilation mode. */
function assembleDirectDossier(overrides: {
  rootEntityId?: string;
  targetEntityId?: string;
  resolveEntityResult?: ResolveEntityResult;
  computeControlResult?: ComputeControlResult;
  sharedAttributesResult?: SharedAttributesResult;
  coConsigneeLinksResult?: CoConsigneeLinksResult;
  scoredEvidence?: readonly { edge: EvidenceEdge; scoreResult: ScoreEvidenceResult }[];
} = {}): ComprehensiveDossier {
  return assembleDossier({
    rootEntityId: overrides.rootEntityId ?? 'root',
    targetEntityId: overrides.targetEntityId ?? 'target',
    resolveEntityResult: overrides.resolveEntityResult ?? makeResolveResult(),
    computeControlResult: overrides.computeControlResult ?? makeControlResult(),
    sharedAttributesResult: overrides.sharedAttributesResult ?? makeSharedAttrsResult(),
    coConsigneeLinksResult: overrides.coConsigneeLinksResult ?? makeCoConsigneeResult(),
    scoredEvidence: overrides.scoredEvidence ?? [],
  }) as ComprehensiveDossier;
}

// =============================================================================
// assembleDossier Tests
// =============================================================================

describe('assembleDossier', () => {
  // ── Legacy GraphManager Mode ────────────────────────────────────────────────

  describe('legacy GraphManager mode', () => {
    describe('normal cases', () => {
      it('handles empty graph with no paths between root and target', () => {
        const gm = new GraphManager();
        gm.addEntity({ id: 'comp-1', type: 'company', name: 'A', jurisdiction: 'US', attributes: {} });
        gm.addEntity({ id: 'comp-2', type: 'company', name: 'B', jurisdiction: 'US', attributes: {} });

        const result = assembleDossier(gm, { root: 'comp-1', target: 'comp-2' });

        expect(result.root).toBe('comp-1');
        expect(result.target).toBe('comp-2');
        expect(result.control.effective_control).toBe(0);
        expect(result.control.meets_threshold).toBe(false);
        expect(result.evidence_confidence.scored).toEqual([]);
        expect(result.evidence_confidence.aggregate_confidence).toBe(0);
        expect(result.assembled_at).toBeDefined();
      });

      it('computes correct dossier for direct ownership path', () => {
        const gm = new GraphManager();
        gm.addEntity({ id: 'comp-1', type: 'company', name: 'A', jurisdiction: 'US', attributes: {} });
        gm.addEntity({ id: 'comp-2', type: 'company', name: 'B', jurisdiction: 'US', attributes: {} });

        gm.addRelationship({
          id: 'edge-1',
          from: 'comp-2',
          to: 'comp-1',
          type: 'owns_pct',
          value: 0.5,
          source_dataset: 'registry',
          record_id: 'rec-1',
          extraction_method: 'registry_filing',
          reliability_tier: 1,
          observed_date: '2025-06-01T00:00:00Z',
        });

        const result = assembleDossier(gm, { root: 'comp-1', target: 'comp-2' });

        expect(result.control.effective_control).toBe(0.5);
        expect(result.control.meets_threshold).toBe(true);
        expect(result.evidence_confidence.scored).toHaveLength(1);
        expect(result.evidence_confidence.aggregate_confidence).toBeGreaterThan(0);
        expect(result.evidence_confidence.weakest_link).toBeDefined();
      });

      it('includes sanctions matches when provided', () => {
        const gm = new GraphManager();
        gm.addEntity({ id: 'comp-1', type: 'company', name: 'A', jurisdiction: 'US', attributes: {} });
        gm.addEntity({ id: 'comp-2', type: 'company', name: 'B', jurisdiction: 'US', attributes: {} });

        const sanctions = {
          matches: [
            { sanction_id: 's1', list: 'OFAC', rationale: 'Test', score: 0.95 },
          ],
        };

        const result = assembleDossier(gm, { root: 'comp-1', target: 'comp-2' }, sanctions);
        expect(result.sanctions.matches).toHaveLength(1);
        expect(result.sanctions.matches[0].list).toBe('OFAC');
      });

      it('defaults to empty sanctions when not provided', () => {
        const gm = new GraphManager();
        gm.addEntity({ id: 'comp-1', type: 'company', name: 'A', jurisdiction: 'US', attributes: {} });
        gm.addEntity({ id: 'comp-2', type: 'company', name: 'B', jurisdiction: 'US', attributes: {} });

        const result = assembleDossier(gm, { root: 'comp-1', target: 'comp-2' });
        expect(result.sanctions.matches).toEqual([]);
      });
    });
  });

  // ── Direct Compilation Mode ─────────────────────────────────────────────────

  describe('direct compilation mode', () => {
    // ── Normal Cases ──────────────────────────────────────────────────────────

    describe('normal cases', () => {
      it('compiles all inputs into a structured ComprehensiveDossier', () => {
        const edge = makeEdge({ id: 'e1' });
        const scoreResult = makeScoreResult({ score: 0.95, confidenceScore: 0.95 });

        const result = assembleDirectDossier({
          rootEntityId: 'root-1',
          targetEntityId: 'target-1',
          resolveEntityResult: makeResolveResult({
            matches: [{
              entity_id: 'target-1',
              score: 0.95,
              matched_features: ['name:exact'],
              ambiguous: false,
              confidence: 'high',
              explanation: 'Exact match',
            }],
          }),
          computeControlResult: makeControlResult({
            effective_control: 0.35,
            meets_threshold: true,
            contributing_paths: [{ path: [], path_control: 0.35 }],
          }),
          sharedAttributesResult: makeSharedAttrsResult({
            matches: [{
              sharedAttributes: [{ type: 'phone', value: '+15550100', originalValue: '+1 555-0100' }],
              matchedEntities: ['root-1', 'target-1'],
              matchedFields: ['phone'],
              confidenceContribution: 0.8,
            }],
          }),
          coConsigneeLinksResult: makeCoConsigneeResult({
            focalEntityId: 'root-1',
            totalFocalShipmentCount: 5,
            links: [{
              linkedEntities: { entityId: 'peer-1', entity: undefined },
              relationshipStrength: 0.6,
              sharedEvidence: [],
              supportingRecordIds: ['rec-ship-1'],
            }],
          }),
          scoredEvidence: [{ edge, scoreResult }],
        });

        // Summary
        expect(result.summary.rootEntityId).toBe('root-1');
        expect(result.summary.targetEntityId).toBe('target-1');
        expect(result.summary.dateAssembled).toBeDefined();
        expect(result.summary.entityResolutionMatches).toHaveLength(1);

        // Ownership
        expect(result.ownership.effectiveControl).toBe(0.35);
        expect(result.ownership.meetsThreshold).toBe(true);
        expect(result.ownership.threshold).toBe(0.25);
        expect(result.ownership.pathCount).toBe(1);

        // Shared attributes & co-consignees
        expect(result.sharedAttributes.matches).toHaveLength(1);
        expect(result.coConsigneeLinks.links).toHaveLength(1);

        // Evidence summary
        expect(result.evidenceSummary.totalEvidenceCount).toBe(1);
        expect(result.evidenceSummary.averageConfidence).toBe(0.95);

        // Confidence summary
        expect(result.confidenceSummary.aggregateConfidence).toBe(0.95);
        expect(result.confidenceSummary.confidenceLevel).toBe('high');
        expect(result.confidenceSummary.weakestLink?.id).toBe('e1');

        // Supporting evidence
        expect(result.supportingEvidence).toHaveLength(1);
        expect(result.supportingEvidence[0].id).toBe('e1');
      });
    });

    // ── Empty Inputs ──────────────────────────────────────────────────────────

    describe('empty inputs', () => {
      it('handles zero scored evidence', () => {
        const result = assembleDirectDossier({
          scoredEvidence: [],
        });

        expect(result.evidenceSummary.totalEvidenceCount).toBe(0);
        expect(result.evidenceSummary.averageConfidence).toBe(0);
        expect(result.confidenceSummary.aggregateConfidence).toBe(1.0); // No evidence → remains at initial 1.0
        expect(result.supportingEvidence).toEqual([]);
      });

      it('handles empty entity resolution matches', () => {
        const result = assembleDirectDossier({
          resolveEntityResult: makeResolveResult({ matches: [] }),
        });

        expect(result.summary.entityResolutionMatches).toEqual([]);
      });

      it('handles empty contributing paths', () => {
        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0,
            meets_threshold: false,
            contributing_paths: [],
          }),
        });

        expect(result.ownership.effectiveControl).toBe(0);
        expect(result.ownership.pathCount).toBe(0);
        expect(result.ownership.contributingPaths).toEqual([]);
      });

      it('handles empty shared attributes', () => {
        const result = assembleDirectDossier({
          sharedAttributesResult: makeSharedAttrsResult({ matches: [] }),
        });

        expect(result.sharedAttributes.matches).toEqual([]);
      });

      it('handles empty co-consignee links', () => {
        const result = assembleDirectDossier({
          coConsigneeLinksResult: makeCoConsigneeResult({ links: [] }),
        });

        expect(result.coConsigneeLinks.links).toEqual([]);
      });
    });

    // ── Recommendations ───────────────────────────────────────────────────────

    describe('recommendations', () => {
      it('recommends UBO establishment when meets threshold', () => {
        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0.35,
            meets_threshold: true,
          }),
        });

        expect(result.recommendations.actions).toContain(
          'Establish Beneficial Ownership UBO: indirect control exceeds 25%.'
        );
        expect(result.recommendations.actions).toContain(
          'Initiate Enhanced Due Diligence (EDD) protocols.'
        );
        expect(result.recommendations.rationale).toContain('Ultimate beneficial ownership has been established');
      });

      it('recommends monitoring when ownership is present but below threshold', () => {
        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0.15,
            meets_threshold: false,
          }),
        });

        expect(result.recommendations.actions).toContain(
          'Monitor ownership structure: significant ownership detected but below 25%.'
        );
        expect(result.recommendations.rationale).toContain('below the 25% beneficial ownership threshold');
      });

      it('reports no ownership when effective control is 0', () => {
        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0,
            meets_threshold: false,
          }),
        });

        expect(result.recommendations.actions).toContain(
          'No direct or indirect ownership paths identified.'
        );
        expect(result.recommendations.rationale).toContain('No ownership ties were detected');
      });

      it('recommends halting transactions for high-confidence sanctions match', () => {
        const result = assembleDirectDossier({
          resolveEntityResult: makeResolveResult({
            matches: [{
              entity_id: 'target',
              score: 0.95,
              matched_features: ['name:exact', 'sanction:OFAC'],
              ambiguous: false,
              confidence: 'high',
              explanation: 'Sanctions match',
            }],
          }),
        });

        expect(result.recommendations.actions).toContain(
          'Halt transactions: potential high-confidence sanctions listing matched.'
        );
        expect(result.recommendations.rationale).toContain('sanctions match');
      });

      it('does NOT recommend halting for medium-confidence sanctions match', () => {
        const result = assembleDirectDossier({
          resolveEntityResult: makeResolveResult({
            matches: [{
              entity_id: 'target',
              score: 0.75,
              matched_features: ['name:partial', 'sanction:OFAC'],
              ambiguous: true,
              confidence: 'medium', // not high
              explanation: 'Possible match',
            }],
          }),
        });

        expect(result.recommendations.actions).not.toContain(
          'Halt transactions: potential high-confidence sanctions listing matched.'
        );
      });

      it('recommends verifying shared attributes when present', () => {
        const result = assembleDirectDossier({
          sharedAttributesResult: makeSharedAttrsResult({
            matches: [{
              sharedAttributes: [{ type: 'phone', value: '+15550100', originalValue: '+1 555-0100' }],
              matchedEntities: ['root', 'target'],
              matchedFields: ['phone'],
              confidenceContribution: 0.8,
            }],
          }),
        });

        expect(result.recommendations.actions).toContain(
          'Verify shared corporate infrastructure (phone/email/address duplication).'
        );
        expect(result.recommendations.rationale).toContain('shared corporate attribute matches');
      });

      it('recommends auditing co-consignee relationships when present', () => {
        const result = assembleDirectDossier({
          coConsigneeLinksResult: makeCoConsigneeResult({
            links: [{
              linkedEntities: { entityId: 'peer', entity: undefined },
              relationshipStrength: 0.5,
              sharedEvidence: [],
              supportingRecordIds: [],
            }],
          }),
        });

        expect(result.recommendations.actions).toContain(
          'Audit shared shipping logs and co-consignee relationships.'
        );
        expect(result.recommendations.rationale).toContain('co-consignee connections');
      });

      it('recommends manual audit when confidence is low', () => {
        const edge = makeEdge({ id: 'e1' });
        const scoreResult = makeScoreResult({ score: 0.3, confidenceScore: 0.3, level: 'low', confidenceLevel: 'low' });

        const result = assembleDirectDossier({
          scoredEvidence: [{ edge, scoreResult }],
        });

        expect(result.recommendations.actions).toContain(
          'Conduct manual audit: supporting evidence confidence is low.'
        );
        expect(result.recommendations.rationale).toContain('low');
      });

      it('does NOT recommend manual audit when confidence is high', () => {
        const edge = makeEdge({ id: 'e1' });
        const scoreResult = makeScoreResult({ score: 0.95, confidenceScore: 0.95 });

        const result = assembleDirectDossier({
          scoredEvidence: [{ edge, scoreResult }],
        });

        expect(result.recommendations.actions).not.toContain(
          'Conduct manual audit: supporting evidence confidence is low.'
        );
        expect(result.recommendations.rationale).toContain('sufficient for standard review');
      });
    });

    // ── Evidence Summary ──────────────────────────────────────────────────────

    describe('evidence summary', () => {
      it('correctly counts total evidence', () => {
        const edges = [
          makeEdge({ id: 'e1' }),
          makeEdge({ id: 'e2' }),
          makeEdge({ id: 'e3' }),
        ];
        const scored = edges.map(e => ({ edge: e, scoreResult: makeScoreResult() }));

        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.evidenceSummary.totalEvidenceCount).toBe(3);
      });

      it('computes correct average confidence', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.8, confidenceScore: 0.8 }) },
          { edge: makeEdge({ id: 'e2' }), scoreResult: makeScoreResult({ score: 0.6, confidenceScore: 0.6 }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        // Average: (0.8 + 0.6) / 2 = 0.7
        expect(result.evidenceSummary.averageConfidence).toBe(0.7);
      });

      it('rounds average confidence to 3 decimal places', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.7, confidenceScore: 0.7 }) },
          { edge: makeEdge({ id: 'e2' }), scoreResult: makeScoreResult({ score: 0.8, confidenceScore: 0.8 }) },
          { edge: makeEdge({ id: 'e3' }), scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        // Average: (0.7 + 0.8 + 0.9) / 3 = 0.8
        const decimalPlaces = (result.evidenceSummary.averageConfidence.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(3);
      });
    });

    // ── Confidence Summary ────────────────────────────────────────────────────

    describe('confidence summary', () => {
      it('aggregate confidence is the minimum score across all evidence', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
          { edge: makeEdge({ id: 'e2' }), scoreResult: makeScoreResult({ score: 0.5, confidenceScore: 0.5 }) },
          { edge: makeEdge({ id: 'e3' }), scoreResult: makeScoreResult({ score: 0.7, confidenceScore: 0.7 }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.aggregateConfidence).toBe(0.5);
      });

      it('weakest link is the edge with the lowest score', () => {
        const scored = [
          { edge: makeEdge({ id: 'e-high' }), scoreResult: makeScoreResult({ score: 0.95, confidenceScore: 0.95 }) },
          { edge: makeEdge({ id: 'e-low' }), scoreResult: makeScoreResult({ score: 0.4, confidenceScore: 0.4 }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.weakestLink?.id).toBe('e-low');
      });

      it('weakestLink is undefined when no scored evidence', () => {
        const result = assembleDirectDossier({ scoredEvidence: [] });
        expect(result.confidenceSummary.weakestLink).toBeUndefined();
      });

      it('confidence level is "high" when aggregate >= 0.85', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
        ];
        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.confidenceLevel).toBe('high');
      });

      it('confidence level is "medium" when aggregate in [0.65, 0.85)', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.7, confidenceScore: 0.7 }) },
        ];
        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.confidenceLevel).toBe('medium');
      });

      it('confidence level is "low" when aggregate < 0.65', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.5, confidenceScore: 0.5 }) },
        ];
        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.confidenceLevel).toBe('low');
      });
    });

    // ── Ownership Summary ─────────────────────────────────────────────────────

    describe('ownership summary', () => {
      it('correctly reports ownership percentage in rationale', () => {
        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0.42,
            meets_threshold: true,
            contributing_paths: [{ path: [], path_control: 0.42 }],
          }),
        });

        expect(result.recommendations.rationale).toContain('42%');
      });

      it('correctly reports path count from contributing_paths length', () => {
        const paths: ControlPath[] = [
          { path: [], path_control: 0.2 },
          { path: [], path_control: 0.15 },
        ];

        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0.35,
            meets_threshold: true,
            contributing_paths: paths,
          }),
        });

        expect(result.ownership.pathCount).toBe(2);
      });
    });

    // ── Duplicate Data ────────────────────────────────────────────────────────

    describe('duplicate data', () => {
      it('includes all scored evidence items in supportingEvidence (no dedup)', () => {
        const edge = makeEdge({ id: 'e1' });
        const scored = [
          { edge, scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
          { edge, scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        // assembleDossier in direct mode maps all items to supportingEvidence
        expect(result.supportingEvidence).toHaveLength(2);
      });
    });

    // ── Missing Optional Fields ───────────────────────────────────────────────

    describe('missing optional fields', () => {
      it('handles resolve entity result with no matched_features containing sanction', () => {
        const result = assembleDirectDossier({
          resolveEntityResult: makeResolveResult({
            matches: [{
              entity_id: 'target',
              score: 0.95,
              matched_features: ['name:exact', 'jurisdiction:exact'],
              ambiguous: false,
              confidence: 'high',
              explanation: 'Exact match',
            }],
          }),
        });

        // No sanction match → should NOT recommend halting
        expect(result.recommendations.actions).not.toContain(
          'Halt transactions: potential high-confidence sanctions listing matched.'
        );
      });

      it('handles score result with various levels correctly', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.65, confidenceScore: 0.65, level: 'medium', confidenceLevel: 'medium' }) },
        ];

        const result = assembleDirectDossier({ scoredEvidence: scored });
        expect(result.confidenceSummary.confidenceLevel).toBe('medium');
      });
    });

    // ── Complex Scenarios ─────────────────────────────────────────────────────

    describe('complex scenarios', () => {
      it('generates all recommendations when all risk signals are present', () => {
        const edge = makeEdge({ id: 'e1' });
        const lowScore = makeScoreResult({ score: 0.3, confidenceScore: 0.3, level: 'low', confidenceLevel: 'low' });

        const result = assembleDirectDossier({
          resolveEntityResult: makeResolveResult({
            matches: [{
              entity_id: 'target',
              score: 0.95,
              matched_features: ['name:exact', 'watchlist:OFAC'],
              ambiguous: false,
              confidence: 'high',
              explanation: 'Sanctions match',
            }],
          }),
          computeControlResult: makeControlResult({
            effective_control: 0.5,
            meets_threshold: true,
          }),
          sharedAttributesResult: makeSharedAttrsResult({
            matches: [{ sharedAttributes: [], matchedEntities: ['r', 't'], matchedFields: [], confidenceContribution: 0.5 }],
          }),
          coConsigneeLinksResult: makeCoConsigneeResult({
            links: [{ linkedEntities: { entityId: 'p', entity: undefined }, relationshipStrength: 0.5, sharedEvidence: [], supportingRecordIds: [] }],
          }),
          scoredEvidence: [{ edge, scoreResult: lowScore }],
        });

        expect(result.recommendations.actions).toContain('Establish Beneficial Ownership UBO: indirect control exceeds 25%.');
        expect(result.recommendations.actions).toContain('Initiate Enhanced Due Diligence (EDD) protocols.');
        expect(result.recommendations.actions).toContain('Halt transactions: potential high-confidence sanctions listing matched.');
        expect(result.recommendations.actions).toContain('Verify shared corporate infrastructure (phone/email/address duplication).');
        expect(result.recommendations.actions).toContain('Audit shared shipping logs and co-consignee relationships.');
        expect(result.recommendations.actions).toContain('Conduct manual audit: supporting evidence confidence is low.');
      });

      it('generates minimal recommendations when no risk signals are present', () => {
        const edge = makeEdge({ id: 'e1' });
        const highScore = makeScoreResult({ score: 0.95, confidenceScore: 0.95 });

        const result = assembleDirectDossier({
          computeControlResult: makeControlResult({
            effective_control: 0,
            meets_threshold: false,
          }),
          scoredEvidence: [{ edge, scoreResult: highScore }],
        });

        expect(result.recommendations.actions).toHaveLength(1);
        expect(result.recommendations.actions[0]).toBe('No direct or indirect ownership paths identified.');
        expect(result.recommendations.rationale).toContain('sufficient for standard review');
      });
    });

    // ── Determinism ───────────────────────────────────────────────────────────

    describe('determinism', () => {
      it('produces identical recommendations across multiple invocations', () => {
        const params = {
          computeControlResult: makeControlResult({
            effective_control: 0.35,
            meets_threshold: true,
          }),
          sharedAttributesResult: makeSharedAttrsResult({
            matches: [{ sharedAttributes: [], matchedEntities: ['r', 't'], matchedFields: [], confidenceContribution: 0.5 }],
          }),
          coConsigneeLinksResult: makeCoConsigneeResult({
            links: [{ linkedEntities: { entityId: 'p', entity: undefined }, relationshipStrength: 0.5, sharedEvidence: [], supportingRecordIds: [] }],
          }),
          scoredEvidence: [
            { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.9, confidenceScore: 0.9 }) },
          ],
        };

        const r1 = assembleDirectDossier(params);
        const r2 = assembleDirectDossier(params);

        expect(r1.recommendations.actions).toEqual(r2.recommendations.actions);
        expect(r1.ownership).toEqual(r2.ownership);
        expect(r1.evidenceSummary).toEqual(r2.evidenceSummary);
        expect(r1.confidenceSummary).toEqual(r2.confidenceSummary);
      });

      it('evidence summary values are deterministic', () => {
        const scored = [
          { edge: makeEdge({ id: 'e1' }), scoreResult: makeScoreResult({ score: 0.8, confidenceScore: 0.8 }) },
          { edge: makeEdge({ id: 'e2' }), scoreResult: makeScoreResult({ score: 0.6, confidenceScore: 0.6 }) },
        ];

        const r1 = assembleDirectDossier({ scoredEvidence: scored });
        const r2 = assembleDirectDossier({ scoredEvidence: scored });

        expect(r1.evidenceSummary.totalEvidenceCount).toBe(r2.evidenceSummary.totalEvidenceCount);
        expect(r1.evidenceSummary.averageConfidence).toBe(r2.evidenceSummary.averageConfidence);
        expect(r1.confidenceSummary.aggregateConfidence).toBe(r2.confidenceSummary.aggregateConfidence);
      });
    });
  });
});
