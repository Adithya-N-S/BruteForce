/**
 * @module assemble-dossier
 * @description
 * Deterministically compiles and structures the final investigation dossier by
 * combining the results of previous pipeline stages (Entity Resolution,
 * Beneficial Ownership calculation, Shared Attributes discovery, Co-Consignee
 * analysis, and Evidence scoring).
 *
 * This module is pure logic: it does not perform any new calculations, graph
 * traversals, or I/O. It provides a structured, audit-ready report with
 * deterministic recommendations for investigators.
 */

import type {
  EntityId,
  Dossier,
  EvidenceEdge,
  MatchSanctionsResult,
  ConfidenceBand,
  ResolveEntityResult,
  ComputeControlResult,
  ControlPath,
  ResolveEntityMatch,
} from '../types.js';
import { GraphManager } from '../graph/graph-manager.js';
import { allControlPaths } from './all-control-paths.js';
import { computeControl } from './compute-control.js';
import { scoreEvidence, type ScoreEvidenceResult } from './score-evidence.js';
import type { SharedAttributesResult } from './find-shared-attributes.js';
import type { CoConsigneeLinksResult } from './co-consignee-links.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summary metadata of the current investigation.
 */
export interface InvestigationSummary {
  /** The starting entity ID under investigation. */
  readonly rootEntityId: EntityId;
  /** The resolved target entity ID (potential UBO). */
  readonly targetEntityId: EntityId;
  /** ISO 8601 date when this dossier was compiled. */
  readonly dateAssembled: string;
  /** Matches returned by entity resolution for the target. */
  readonly entityResolutionMatches: readonly ResolveEntityMatch[];
}

/**
 * Summarised beneficial ownership information.
 */
export interface EffectiveOwnershipSummary {
  /** The cumulative effective control percentage from root to target. */
  readonly effectiveControl: number;
  /** Whether the effective ownership meets or exceeds the regulatory threshold. */
  readonly meetsThreshold: boolean;
  /** Regulatory beneficial ownership threshold (fixed at 0.25). */
  readonly threshold: number;
  /** Total number of parallel control paths found between root and target. */
  readonly pathCount: number;
  /** Detailed ownership paths. */
  readonly contributingPaths: readonly ControlPath[];
}

/**
 * General metrics regarding the supporting evidence.
 */
export interface EvidenceSummary {
  /** Total number of unique evidence edges. */
  readonly totalEvidenceCount: number;
  /** The mathematical average of all edge confidence scores. */
  readonly averageConfidence: number;
}

/**
 * Confidence assessment for the critical evidence path.
 */
export interface ConfidenceSummary {
  /** The lowest individual edge confidence score (minimum along path). */
  readonly aggregateConfidence: number;
  /** Categorical confidence level ('high', 'medium', or 'low'). */
  readonly confidenceLevel: ConfidenceBand;
  /** The weakest supporting edge (the one with aggregateConfidence). */
  readonly weakestLink?: EvidenceEdge;
}

/**
 * Deterministic, audit-ready recommendations generated based on dossier values.
 */
export interface RecommendationsSection {
  /** Specific actions recommended for the compliance officer. */
  readonly actions: readonly string[];
  /** Detailed, deterministic rationale for the recommended actions. */
  readonly rationale: string;
}

/**
 * The comprehensive, multi-component investigation dossier.
 */
export interface ComprehensiveDossier {
  /** High-level summary of the investigation scope. */
  readonly summary: InvestigationSummary;
  /** Cumulative ownership details. */
  readonly ownership: EffectiveOwnershipSummary;
  /** Discovered shared corporate infrastructure metadata. */
  readonly sharedAttributes: SharedAttributesResult;
  /** Trade-based co-occurrence connections. */
  readonly coConsigneeLinks: CoConsigneeLinksResult;
  /** Evidence metrics. */
  readonly evidenceSummary: EvidenceSummary;
  /** Path-level confidence assessment. */
  readonly confidenceSummary: ConfidenceSummary;
  /** List of supporting evidence edges. */
  readonly supportingEvidence: readonly EvidenceEdge[];
  /** Actions and deterministic reasoning. */
  readonly recommendations: RecommendationsSection;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overloaded signature for legacy GraphManager-based dossier generation.
 */
export function assembleDossier(
  graph: GraphManager,
  params: { root: EntityId; target: EntityId },
  sanctionMatches?: MatchSanctionsResult
): Dossier;

/**
 * Overloaded signature for compiling precomputed algorithm outputs into a
 * structured, comprehensive investigation dossier.
 */
export function assembleDossier(
  params: {
    readonly rootEntityId: EntityId;
    readonly targetEntityId: EntityId;
    readonly resolveEntityResult: ResolveEntityResult;
    readonly computeControlResult: ComputeControlResult;
    readonly sharedAttributesResult: SharedAttributesResult;
    readonly coConsigneeLinksResult: CoConsigneeLinksResult;
    readonly scoredEvidence: readonly {
      readonly edge: EvidenceEdge;
      readonly scoreResult: ScoreEvidenceResult;
    }[];
  }
): ComprehensiveDossier;

/**
 * Implementation of the overloaded `assembleDossier` function.
 */
export function assembleDossier(
  arg1:
    | GraphManager
    | {
        readonly rootEntityId: EntityId;
        readonly targetEntityId: EntityId;
        readonly resolveEntityResult: ResolveEntityResult;
        readonly computeControlResult: ComputeControlResult;
        readonly sharedAttributesResult: SharedAttributesResult;
        readonly coConsigneeLinksResult: CoConsigneeLinksResult;
        readonly scoredEvidence: readonly {
          readonly edge: EvidenceEdge;
          readonly scoreResult: ScoreEvidenceResult;
        }[];
      },
  arg2?: { root: EntityId; target: EntityId },
  arg3?: MatchSanctionsResult
): Dossier | ComprehensiveDossier {
  if (arg1 instanceof GraphManager) {
    // ── Legacy GraphManager Mode ─────────────────────────────────────────────
    const params = arg2!;
    const sanctionMatches = arg3;

    const paths = allControlPaths(arg1, { from: params.target, to: params.root });
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
      edge.confidence! < min.confidence! ? edge : min
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

  // ── Precomputed Direct Assembly Mode ───────────────────────────────────────
  const {
    rootEntityId,
    targetEntityId,
    resolveEntityResult,
    computeControlResult,
    sharedAttributesResult,
    coConsigneeLinksResult,
    scoredEvidence,
  } = arg1;

  // 1. Investigation Summary
  const summary: InvestigationSummary = {
    rootEntityId,
    targetEntityId,
    dateAssembled: new Date().toISOString(),
    entityResolutionMatches: resolveEntityResult.matches,
  };

  // 2. Effective Ownership Summary
  const ownership: EffectiveOwnershipSummary = {
    effectiveControl: computeControlResult.effective_control,
    meetsThreshold: computeControlResult.meets_threshold,
    threshold: computeControlResult.threshold,
    pathCount: computeControlResult.contributing_paths.length,
    contributingPaths: computeControlResult.contributing_paths,
  };

  // 3. Evidence & Confidence Summary
  const totalEvidenceCount = scoredEvidence.length;
  let sumConfidence = 0;
  let aggregateConfidence = 1.0;
  let weakestLink: EvidenceEdge | undefined;
  let weakestLinkScore = 1.0;

  for (const item of scoredEvidence) {
    sumConfidence += item.scoreResult.score;
    if (item.scoreResult.score < aggregateConfidence) {
      aggregateConfidence = item.scoreResult.score;
    }
    if (item.scoreResult.score < weakestLinkScore) {
      weakestLinkScore = item.scoreResult.score;
      weakestLink = item.edge;
    }
  }

  const averageConfidence = totalEvidenceCount > 0 ? sumConfidence / totalEvidenceCount : 0;

  const confidenceLevel: ConfidenceBand =
    aggregateConfidence >= 0.85
      ? 'high'
      : aggregateConfidence >= 0.65
      ? 'medium'
      : 'low';

  const evidenceSummary: EvidenceSummary = {
    totalEvidenceCount,
    averageConfidence: Math.round(averageConfidence * 1000) / 1000,
  };

  const confidenceSummary: ConfidenceSummary = {
    aggregateConfidence,
    confidenceLevel,
    ...(weakestLink ? { weakestLink } : {}),
  };

  // 4. Supporting Evidence
  const supportingEvidence = scoredEvidence.map(item => item.edge);

  // 5. Recommendations Section (Deterministic Rationale & Action Plan)
  const actions: string[] = [];
  let rationale = `Ownership is ${Math.round(ownership.effectiveControl * 100)}%. `;

  if (ownership.meetsThreshold) {
    actions.push('Establish Beneficial Ownership UBO: indirect control exceeds 25%.');
    actions.push('Initiate Enhanced Due Diligence (EDD) protocols.');
    rationale += 'Ultimate beneficial ownership has been established at or above the regulatory threshold of 25%. ';
  } else if (ownership.effectiveControl > 0) {
    actions.push('Monitor ownership structure: significant ownership detected but below 25%.');
    rationale += 'Indirect ownership is present but falls below the 25% beneficial ownership threshold. ';
  } else {
    actions.push('No direct or indirect ownership paths identified.');
    rationale += 'No ownership ties were detected between root and target entities. ';
  }

  // Check resolved matches for high-risk flags or sanctions
  const hasSanctionMatch = resolveEntityResult.matches.some(
    m =>
      m.confidence === 'high' &&
      m.matched_features.some(f => f.includes('sanction') || f.includes('watchlist'))
  );
  if (hasSanctionMatch) {
    actions.push('Halt transactions: potential high-confidence sanctions listing matched.');
    rationale += 'A potential sanctions match was detected during entity resolution. ';
  }

  // Check shared attributes
  if (sharedAttributesResult.matches.length > 0) {
    actions.push('Verify shared corporate infrastructure (phone/email/address duplication).');
    rationale += `${sharedAttributesResult.matches.length} shared corporate attribute matches found, indicating potential corporate layering or shell constructs. `;
  }

  // Check co-consignees
  if (coConsigneeLinksResult.links.length > 0) {
    actions.push('Audit shared shipping logs and co-consignee relationships.');
    rationale += `${coConsigneeLinksResult.links.length} co-consignee connections found in trade records. `;
  }

  // Check confidence level
  if (confidenceLevel === 'low') {
    actions.push('Conduct manual audit: supporting evidence confidence is low.');
    rationale += 'Overall confidence in the evidence path is low; manual document verification is highly recommended.';
  } else {
    rationale += 'Overall evidence path confidence is sufficient for standard review.';
  }

  const recommendations: RecommendationsSection = {
    actions,
    rationale,
  };

  return {
    summary,
    ownership,
    sharedAttributes: sharedAttributesResult,
    coConsigneeLinks: coConsigneeLinksResult,
    evidenceSummary,
    confidenceSummary,
    supportingEvidence,
    recommendations,
  };
}
