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

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Internal Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of edge types that indicate an entity's role on a trade shipment.
 * Kept as a `Set` for O(1) membership checks.
 *
 * @internal
 */
const TRADE_EDGE_TYPES: ReadonlySet<string> = new Set<TradeEdgeType>([
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
function buildAdjacencyIndex(
  edges: readonly EvidenceEdge[]
): Map<EntityId, EvidenceEdge[]> {
  const index = new Map<EntityId, EvidenceEdge[]>();

  for (const edge of edges) {
    // Index by `from`
    if (!index.has(edge.from)) {
      index.set(edge.from, []);
    }
    index.get(edge.from)!.push(edge);

    // Index by `to`
    if (!index.has(edge.to)) {
      index.set(edge.to, []);
    }
    index.get(edge.to)!.push(edge);
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
function buildNodeIndex(
  nodes: readonly EntityNode[]
): Map<EntityId, EntityNode> {
  const index = new Map<EntityId, EntityNode>();
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
function findFocalShipmentIds(
  focalEntityId: EntityId,
  adjacencyIndex: Map<EntityId, EvidenceEdge[]>
): Set<EntityId> {
  const shipmentIds = new Set<EntityId>();
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
 * Internal accumulator that tracks co-occurrence data for a single peer entity.
 *
 * @internal
 */
interface PeerAccumulator {
  /** Distinct shipment IDs on which both focal and peer appear. */
  sharedShipmentIds: Set<EntityId>;
  /** Deduplicated edges connecting the peer to shared shipments. */
  evidenceEdgeMap: Map<string, EvidenceEdge>;
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
function collectPeerData(
  focalEntityId: EntityId,
  shipmentIds: ReadonlySet<EntityId>,
  adjacencyIndex: Map<EntityId, EvidenceEdge[]>
): Map<EntityId, PeerAccumulator> {
  const peerMap = new Map<EntityId, PeerAccumulator>();

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
      let peerId: EntityId;
      if (edge.from === shipmentId) {
        peerId = edge.to;
      } else if (edge.to === shipmentId) {
        peerId = edge.from;
      } else {
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

      const accumulator = peerMap.get(peerId)!;

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
function computeRelationshipStrength(
  sharedShipmentCount: number,
  totalFocalShipmentCount: number
): number {
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
function sortLinks(links: CoConsigneeLink[]): CoConsigneeLink[] {
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
function buildCoConsigneeLink(
  peerId: EntityId,
  accumulator: PeerAccumulator,
  totalFocalShipmentCount: number,
  nodeIndex: Map<EntityId, EntityNode>
): CoConsigneeLink {
  const strength = computeRelationshipStrength(
    accumulator.sharedShipmentIds.size,
    totalFocalShipmentCount
  );

  // Sort evidence edges ascending by ID for determinism.
  const sharedEvidence: EvidenceEdge[] = [...accumulator.evidenceEdgeMap.values()].sort(
    (a, b) => a.id.localeCompare(b.id)
  );

  // Deduplicate and sort supporting record IDs.
  const recordIdSet = new Set<string>(sharedEvidence.map(e => e.record_id));
  const supportingRecordIds: string[] = [...recordIdSet].sort((a, b) =>
    a.localeCompare(b)
  );

  const linkedEntities: CoConsigneePeer = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

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
export function coConsigneeLinks(
  graph: EvidenceGraph,
  params: { entity_id: EntityId }
): CoConsigneeLinksResult;
export function coConsigneeLinks(
  graph: GraphManager,
  params: { entity_id: EntityId }
): CoConsigneeLinksResult;
export function coConsigneeLinks(
  graph: EvidenceGraph | GraphManager,
  params: { entity_id: EntityId }
): CoConsigneeLinksResult {
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
  const rawLinks: CoConsigneeLink[] = [];

  for (const [peerId, accumulator] of peerMap) {
    rawLinks.push(
      buildCoConsigneeLink(peerId, accumulator, totalFocalShipmentCount, nodeIndex)
    );
  }

  // ── Step 5: Sort deterministically and return ─────────────────────────────
  const links = sortLinks(rawLinks);

  return {
    focalEntityId,
    totalFocalShipmentCount,
    links,
  };
}
