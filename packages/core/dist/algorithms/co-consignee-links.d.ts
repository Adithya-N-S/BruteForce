/**
 * @module co-consignee-links
 * @description
 * Identifies entities that repeatedly appear together as consignees or
 * recipients within shipment or trade evidence in the VEILBREAKER evidence graph.
 *
 * ## Algorithm
 * Given a focal entity, this module:
 *   1. Collects all shipment intermediary nodes the focal entity is linked to
 *      via `consignee_on` or `shipper_on` edges.
 *   2. For each such shipment, finds every *other* entity that also appears on
 *      that shipment (co-consignees / co-shippers).
 *   3. Groups those co-occurrences by peer entity, deduplicating by edge ID to
 *      avoid double-counting the same Bill of Lading parsed twice.
 *   4. Computes a deterministic relationship-strength score for each peer
 *      based on co-occurrence frequency relative to the total number of
 *      distinct shipments the focal entity appears on.
 *   5. Returns results sorted deterministically (descending strength, then
 *      ascending peer ID for tie-breaking).
 *
 * ## Determinism guarantee
 * All ordering is performed with stable, lexicographic tie-breaking.
 * No random values, Date.now(), or external state are used.
 *
 * @see ExtractionMethod - 'co_consignee_derivation' is used when creating
 *   synthetic edges from the result of this algorithm.
 * @see EvidenceEdgeType - 'consignee_on' | 'shipper_on' are the relevant types.
 */
import type { EntityId, EntityNode, EvidenceEdge, EvidenceGraph } from '../types.js';
import { GraphManager } from '../graph/graph-manager.js';
/**
 * The subset of edge types that indicate an entity's role on a trade shipment.
 * Both sides of the shipping relationship are considered for co-occurrence.
 */
export type TradeEdgeType = 'consignee_on' | 'shipper_on';
/**
 * A single peer entity that co-appears with the focal entity on one or more
 * shipments.
 */
export interface CoConsigneePeer {
    /**
     * The entity that co-appears with the focal entity on at least one shipment.
     * Resolved from the evidence graph; `undefined` if the node is not present
     * in the graph snapshot (orphan edge scenario).
     */
    readonly entity: EntityNode | undefined;
    /**
     * The entity ID of the co-appearing peer. Always present, even when the
     * node is not found in the graph snapshot.
     */
    readonly entityId: EntityId;
}
/**
 * A co-consignee relationship linking the focal entity to a peer entity across
 * one or more shared shipments.
 */
export interface CoConsigneeLink {
    /**
     * The peer entity that co-appears with the focal entity on shipments.
     * Includes the resolved `EntityNode` (or `undefined` for orphan IDs) and
     * the raw `entityId`.
     */
    readonly linkedEntities: CoConsigneePeer;
    /**
     * Relationship strength in the range [0, 1].
     *
     * Computed as:
     *   `sharedShipmentCount / totalFocalShipmentCount`
     *
     * Where:
     * - `sharedShipmentCount` — the number of distinct shipment nodes on which
     *   both the focal entity and this peer appear.
     * - `totalFocalShipmentCount` — the total number of distinct shipments the
     *   focal entity appears on (the denominator caps at 1 to avoid division
     *   by zero).
     *
     * A strength of `1.0` means the peer appears on every shipment the focal
     * entity is involved in.
     */
    readonly relationshipStrength: number;
    /**
     * The deduplicated set of `EvidenceEdge` objects that provide evidence for
     * this co-occurrence relationship.
     *
     * Edges are included if they connect the **peer entity** to any shipment
     * that the focal entity also participates in. Deduplication is performed
     * by `EvidenceEdge.id`.
     *
     * Sorted ascending by `EvidenceEdge.id` for deterministic output.
     */
    readonly sharedEvidence: readonly EvidenceEdge[];
    /**
     * Unique `record_id` values drawn from all edges in `sharedEvidence`.
     *
     * These are the foreign keys into the provenance store that allow analysts
     * to click through to the original bill-of-lading or trade record.
     *
     * Deduplicated and sorted ascending for deterministic output.
     */
    readonly supportingRecordIds: readonly string[];
}
/**
 * The complete result returned by {@link coConsigneeLinks}.
 */
export interface CoConsigneeLinksResult {
    /**
     * The ID of the focal entity that was queried.
     */
    readonly focalEntityId: EntityId;
    /**
     * The total number of distinct shipments the focal entity participates in.
     * Used as the denominator in strength calculations.
     */
    readonly totalFocalShipmentCount: number;
    /**
     * All co-consignee links for the focal entity, sorted descending by
     * `relationshipStrength`, then ascending by `linkedEntities.entityId`
     * for deterministic tie-breaking.
     */
    readonly links: readonly CoConsigneeLink[];
}
/**
 * Identifies entities that repeatedly appear together with a focal entity as
 * consignees or recipients within shipment or trade evidence.
 *
 * ## Usage
 * ```ts
 * import { coConsigneeLinks } from './co-consignee-links.js';
 *
 * const result = coConsigneeLinks(graph, { entity_id: 'ent-001' });
 *
 * for (const link of result.links) {
 *   console.log(
 *     link.linkedEntities.entity?.name,
 *     'strength:', link.relationshipStrength,
 *     'records:', link.supportingRecordIds
 *   );
 * }
 * ```
 *
 * ## Algorithm walkthrough
 * 1. Build adjacency index and node lookup from `graph.edges` and `graph.nodes`.
 * 2. Find all shipment node IDs the focal entity participates in via
 *    `consignee_on` or `shipper_on` edges.
 * 3. For each shipment, collect all *other* entities that have a trade-type edge
 *    to that same shipment — these are the co-consignees.
 * 4. Accumulate co-occurrence counts and deduplicate evidence edges by ID.
 * 5. Compute deterministic relationship strength per peer.
 * 6. Return sorted, fully typed results.
 *
 * ## Complexity
 * - Time:  O(S × E_s) where S = number of shipments, E_s = average edges per
 *   shipment. In practice O(|E|) because each edge is visited at most twice.
 * - Space: O(|E| + |V|) for the adjacency and node indices.
 *
 * @param graph - A serialisable snapshot of the evidence graph (`EvidenceGraph`).
 *   Both `nodes` and `edges` arrays are consumed.
 * @param params - Query parameters.
 * @param params.entity_id - The ID of the focal entity to investigate.
 * @returns A {@link CoConsigneeLinksResult} containing all co-consignee links,
 *   sorted deterministically.
 *
 * @example
 * // Minimal usage with a two-node, one-shipment graph
 * const result = coConsigneeLinks(
 *   {
 *     nodes: [
 *       { id: 'company-A', type: 'company', name: 'Alpha', jurisdiction: 'US', attributes: {} },
 *       { id: 'company-B', type: 'company', name: 'Beta',  jurisdiction: 'CN', attributes: {} },
 *       { id: 'shipment-1', type: 'vessel', name: 'BL-001', jurisdiction: '', attributes: {} },
 *     ],
 *     edges: [
 *       {
 *         id: 'e1', from: 'company-A', to: 'shipment-1',
 *         type: 'consignee_on', source_dataset: 'trade', record_id: 'rec-1',
 *         extraction_method: 'bill_of_lading_field', reliability_tier: 2,
 *       },
 *       {
 *         id: 'e2', from: 'company-B', to: 'shipment-1',
 *         type: 'consignee_on', source_dataset: 'trade', record_id: 'rec-2',
 *         extraction_method: 'bill_of_lading_field', reliability_tier: 2,
 *       },
 *     ],
 *   },
 *   { entity_id: 'company-A' }
 * );
 * // result.links[0].linkedEntities.entityId === 'company-B'
 * // result.links[0].relationshipStrength === 1
 */
export declare function coConsigneeLinks(graph: EvidenceGraph, params: {
    entity_id: EntityId;
}): CoConsigneeLinksResult;
export declare function coConsigneeLinks(graph: GraphManager, params: {
    entity_id: EntityId;
}): CoConsigneeLinksResult;
//# sourceMappingURL=co-consignee-links.d.ts.map