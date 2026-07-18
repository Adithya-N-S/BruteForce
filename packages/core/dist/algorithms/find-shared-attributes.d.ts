/**
 * @module algorithms/find-shared-attributes
 * @description
 * Deterministic algorithm to identify attributes shared between entities.
 *
 * This algorithm supports two modes:
 * 1. Scanning a list of nodes and edges to find groups of entities sharing attributes (new).
 * 2. Finding shared attribute links for a specific entity in a GraphManager (backward compatibility).
 */
import type { EntityId, EvidenceEdge, EntityNode } from '../types.js';
import type { GraphManager } from '../graph/graph-manager.js';
/**
 * Represents a single shared attribute value and its type.
 */
export interface SharedAttribute {
    /** The category of the attribute (e.g., 'phone', 'email', 'address', etc.) */
    readonly type: string;
    /** The normalized value used for matching */
    readonly value: string;
    /** The original display value */
    readonly originalValue: string;
}
/**
 * A group of entities that share one or more attributes.
 */
export interface SharedAttributeMatch {
    /** The list of attributes shared by all entities in matchedEntities */
    readonly sharedAttributes: readonly SharedAttribute[];
    /** The list of entity IDs sharing these attributes */
    readonly matchedEntities: readonly EntityId[];
    /** The list of attribute fields/types that matched */
    readonly matchedFields: readonly string[];
    /** The aggregated confidence contribution for this match in [0, 1] */
    readonly confidenceContribution: number;
}
/**
 * The output of the findSharedAttributes algorithm in node/edge list mode.
 */
export interface SharedAttributesResult {
    /** The list of matches, sorted descending by confidence contribution */
    readonly matches: readonly SharedAttributeMatch[];
}
/**
 * Original link structure for backward compatibility.
 */
export interface SharedAttributeLink {
    readonly linked_entity_id: EntityId;
    readonly shared_attribute_type: string;
    readonly shared_attribute_value: string;
    readonly edges: readonly EvidenceEdge[];
}
/**
 * Identifies attributes shared between two or more entities in the investigation graph.
 *
 * Supports both list scanning and GraphManager backward compatibility signature.
 *
 * @param nodesOrGraph - Either an array of EntityNode, or a GraphManager instance.
 * @param edgesOrParams - Either an array of EvidenceEdge, or params containing entity_id.
 * @returns Result object.
 */
export declare function findSharedAttributes(nodes: readonly EntityNode[], edges: readonly EvidenceEdge[]): SharedAttributesResult;
export declare function findSharedAttributes(graph: GraphManager, params: {
    entity_id: EntityId;
    attribute?: 'director' | 'address' | 'agent' | 'phone';
}): {
    links: SharedAttributeLink[];
};
//# sourceMappingURL=find-shared-attributes.d.ts.map