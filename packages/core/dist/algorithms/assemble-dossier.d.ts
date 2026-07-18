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
import type { EntityId, Dossier, EvidenceEdge, MatchSanctionsResult, ConfidenceBand, ResolveEntityResult, ComputeControlResult, ControlPath, ResolveEntityMatch } from '../types.js';
import { GraphManager } from '../graph/graph-manager.js';
import { type ScoreEvidenceResult } from './score-evidence.js';
import type { SharedAttributesResult } from './find-shared-attributes.js';
import type { CoConsigneeLinksResult } from './co-consignee-links.js';
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
/**
 * Overloaded signature for legacy GraphManager-based dossier generation.
 */
export declare function assembleDossier(graph: GraphManager, params: {
    root: EntityId;
    target: EntityId;
}, sanctionMatches?: MatchSanctionsResult): Dossier;
/**
 * Overloaded signature for compiling precomputed algorithm outputs into a
 * structured, comprehensive investigation dossier.
 */
export declare function assembleDossier(params: {
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
}): ComprehensiveDossier;
//# sourceMappingURL=assemble-dossier.d.ts.map