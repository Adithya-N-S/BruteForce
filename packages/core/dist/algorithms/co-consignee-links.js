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
import { GraphManager } from '../graph/graph-manager.js';
// ─────────────────────────────────────────────────────────────────────────────
// Internal Constants
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The set of edge types that indicate an entity's role on a trade shipment.
 * Kept as a `Set` for O(1) membership checks.
 *
 * @internal
 */
const TRADE_EDGE_TYPES = new Set([
    'consignee_on',
    'shipper_on',
]);
// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Builds an adjacency index from the edge list for efficient node-level
 * lookups.
 *
 * Each entry in the map contains all edges incident to a given entity ID
 * (both as `from` and `to`).
 *
 * @param edges - The full edge list from the evidence graph.
 * @returns A `Map` keyed by entity ID with its incident edges.
 *
 * @internal
 */
function buildAdjacencyIndex(edges) {
    const index = new Map();
    for (const edge of edges) {
        // Index by `from`
        if (!index.has(edge.from)) {
            index.set(edge.from, []);
        }
        index.get(edge.from).push(edge);
        // Index by `to`
        if (!index.has(edge.to)) {
            index.set(edge.to, []);
        }
        index.get(edge.to).push(edge);
    }
    return index;
}
/**
 * Builds a node lookup map from the node list for O(1) entity resolution.
 *
 * @param nodes - The full node list from the evidence graph.
 * @returns A `Map` keyed by entity ID.
 *
 * @internal
 */
function buildNodeIndex(nodes) {
    const index = new Map();
    for (const node of nodes) {
        index.set(node.id, node);
    }
    return index;
}
/**
 * Finds all distinct shipment (intermediary) node IDs that the given focal
 * entity is linked to via trade-type edges.
 *
 * A "shipment node" is the entity on the *other* side of a `consignee_on` or
 * `shipper_on` edge — it typically represents a Bill of Lading or a vessel
 * voyage in the graph.
 *
 * @param focalEntityId - The entity being investigated.
 * @param adjacencyIndex - Pre-built adjacency index for the graph.
 * @returns A `Set` of distinct shipment node IDs.
 *
 * @internal
 */
function findFocalShipmentIds(focalEntityId, adjacencyIndex) {
    const shipmentIds = new Set();
    const incidentEdges = adjacencyIndex.get(focalEntityId) ?? [];
    for (const edge of incidentEdges) {
        if (!TRADE_EDGE_TYPES.has(edge.type)) {
            continue;
        }
        // The shipment node is always the entity that is NOT the focal entity.
        const shipmentId = edge.from === focalEntityId ? edge.to : edge.from;
        shipmentIds.add(shipmentId);
    }
    return shipmentIds;
}
/**
 * Collects co-occurrence data for all peer entities across all shipments that
 * the focal entity participates in.
 *
 * For each shared shipment, this function:
 *   - Enumerates every trade edge incident to that shipment.
 *   - Excludes any edge that touches the focal entity (we only want peers).
 *   - Accumulates data into per-peer buckets, deduplicating by edge ID.
 *
 * @param focalEntityId - The entity being investigated.
 * @param shipmentIds - The set of shipment node IDs the focal entity appears on.
 * @param adjacencyIndex - Pre-built adjacency index for the graph.
 * @returns A `Map` keyed by peer entity ID, containing each peer's accumulated
 *   co-occurrence data.
 *
 * @internal
 */
function collectPeerData(focalEntityId, shipmentIds, adjacencyIndex) {
    const peerMap = new Map();
    for (const shipmentId of shipmentIds) {
        const shipmentEdges = adjacencyIndex.get(shipmentId) ?? [];
        for (const edge of shipmentEdges) {
            // Only consider trade-type edges.
            if (!TRADE_EDGE_TYPES.has(edge.type)) {
                continue;
            }
            // Identify the "other" entity on this edge relative to the shipment node.
            // If neither side is the shipment node, skip (should not happen with
            // correct data, but we guard defensively).
            let peerId;
            if (edge.from === shipmentId) {
                peerId = edge.to;
            }
            else if (edge.to === shipmentId) {
                peerId = edge.from;
            }
            else {
                continue;
            }
            // Exclude the focal entity itself from the peer list.
            if (peerId === focalEntityId) {
                continue;
            }
            // Ensure an accumulator bucket exists for this peer.
            if (!peerMap.has(peerId)) {
                peerMap.set(peerId, {
                    sharedShipmentIds: new Set(),
                    evidenceEdgeMap: new Map(),
                });
            }
            const accumulator = peerMap.get(peerId);
            // Record this shipment as shared with the peer.
            accumulator.sharedShipmentIds.add(shipmentId);
            // Deduplicate by edge ID.
            if (!accumulator.evidenceEdgeMap.has(edge.id)) {
                accumulator.evidenceEdgeMap.set(edge.id, edge);
            }
        }
    }
    return peerMap;
}
/**
 * Computes the relationship strength for a peer entity.
 *
 * Strength is defined as the fraction of the focal entity's shipments on which
 * the peer also appears. Clamped to [0, 1] and truncated to 4 decimal places
 * for deterministic floating-point representation.
 *
 * @param sharedShipmentCount - Number of shipments shared between focal and peer.
 * @param totalFocalShipmentCount - Total shipments the focal entity appears on.
 * @returns Strength in [0, 1], rounded to 4 decimal places.
 *
 * @internal
 */
function computeRelationshipStrength(sharedShipmentCount, totalFocalShipmentCount) {
    if (totalFocalShipmentCount === 0) {
        return 0;
    }
    const raw = sharedShipmentCount / totalFocalShipmentCount;
    // Round to 4 decimal places for deterministic floating-point output.
    return Math.round(raw * 10_000) / 10_000;
}
/**
 * Sorts an array of `CoConsigneeLink` objects deterministically:
 *   - Primary: descending by `relationshipStrength` (higher first).
 *   - Secondary (tie-break): ascending by `linkedEntities.entityId` (lexicographic).
 *
 * This sort is pure and does not mutate the original array.
 *
 * @param links - The array to sort.
 * @returns A new sorted array.
 *
 * @internal
 */
function sortLinks(links) {
    return [...links].sort((a, b) => {
        if (b.relationshipStrength !== a.relationshipStrength) {
            return b.relationshipStrength - a.relationshipStrength;
        }
        // Tie-break: ascending entity ID (lexicographic).
        return a.linkedEntities.entityId.localeCompare(b.linkedEntities.entityId);
    });
}
/**
 * Converts a `PeerAccumulator` into the public-facing `CoConsigneeLink` shape.
 *
 * @param peerId - The peer entity ID.
 * @param accumulator - The accumulated co-occurrence data for this peer.
 * @param totalFocalShipmentCount - Total shipments the focal entity appears on.
 * @param nodeIndex - Pre-built node lookup map.
 * @returns A fully populated `CoConsigneeLink`.
 *
 * @internal
 */
function buildCoConsigneeLink(peerId, accumulator, totalFocalShipmentCount, nodeIndex) {
    const strength = computeRelationshipStrength(accumulator.sharedShipmentIds.size, totalFocalShipmentCount);
    // Sort evidence edges ascending by ID for determinism.
    const sharedEvidence = [...accumulator.evidenceEdgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    // Deduplicate and sort supporting record IDs.
    const recordIdSet = new Set(sharedEvidence.map(e => e.record_id));
    const supportingRecordIds = [...recordIdSet].sort((a, b) => a.localeCompare(b));
    const linkedEntities = {
        entityId: peerId,
        entity: nodeIndex.get(peerId),
    };
    return {
        linkedEntities,
        relationshipStrength: strength,
        sharedEvidence,
        supportingRecordIds,
    };
}
export function coConsigneeLinks(graph, params) {
    const { entity_id: focalEntityId } = params;
    const edges = graph instanceof GraphManager ? graph.toEvidenceGraph().edges : graph.edges;
    const nodes = graph instanceof GraphManager ? graph.toEvidenceGraph().nodes : graph.nodes;
    // ── Step 1: Build indexes ─────────────────────────────────────────────────
    const adjacencyIndex = buildAdjacencyIndex(edges);
    const nodeIndex = buildNodeIndex(nodes);
    // ── Step 2: Find shipments the focal entity participates in ───────────────
    const shipmentIds = findFocalShipmentIds(focalEntityId, adjacencyIndex);
    const totalFocalShipmentCount = shipmentIds.size;
    // ── Step 3: Collect co-occurrence data for all peer entities ──────────────
    const peerMap = collectPeerData(focalEntityId, shipmentIds, adjacencyIndex);
    // ── Step 4: Convert accumulator map to CoConsigneeLink objects ────────────
    const rawLinks = [];
    for (const [peerId, accumulator] of peerMap) {
        rawLinks.push(buildCoConsigneeLink(peerId, accumulator, totalFocalShipmentCount, nodeIndex));
    }
    // ── Step 5: Sort deterministically and return ─────────────────────────────
    const links = sortLinks(rawLinks);
    return {
        focalEntityId,
        totalFocalShipmentCount,
        links,
    };
}
//# sourceMappingURL=co-consignee-links.js.map