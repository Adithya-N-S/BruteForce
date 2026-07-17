import { describe, it, expect } from 'vitest';
import { coConsigneeLinks } from '../src/algorithms/co-consignee-links.js';
import type { EntityNode, EvidenceEdge, EvidenceGraph } from '../src/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal valid entity node factory. */
function makeNode(overrides: Partial<EntityNode> & { id: string }): EntityNode {
  return {
    type: 'company',
    name: overrides.id,
    jurisdiction: '',
    attributes: {},
    ...overrides,
  };
}

/** Minimal valid trade-type evidence edge factory. */
function makeTradeEdge(overrides: Partial<EvidenceEdge> & { id: string; from: string; to: string }): EvidenceEdge {
  return {
    type: 'consignee_on',
    source_dataset: 'trade',
    record_id: `rec-${overrides.id}`,
    extraction_method: 'bill_of_lading_field',
    reliability_tier: 2,
    ...overrides,
  };
}

/** Builds a minimal EvidenceGraph from node and edge arrays. */
function makeGraph(nodes: EntityNode[], edges: EvidenceEdge[]): EvidenceGraph {
  return { nodes, edges };
}

// =============================================================================
// coConsigneeLinks Tests
// =============================================================================

describe('coConsigneeLinks', () => {
  // ── Normal Cases ────────────────────────────────────────────────────────────

  describe('normal cases', () => {
    it('detects a simple co-consignee on a single shared shipment', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1', name: 'Company One' }),
          makeNode({ id: 'ent-2', name: 'Company Two' }),
          makeNode({ id: 'ship-1', type: 'vessel', name: 'Voyage 101' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });

      expect(result.focalEntityId).toBe('ent-1');
      expect(result.totalFocalShipmentCount).toBe(1);
      expect(result.links).toHaveLength(1);

      const link = result.links[0];
      expect(link.linkedEntities.entityId).toBe('ent-2');
      expect(link.linkedEntities.entity).toBeDefined();
      expect(link.linkedEntities.entity?.name).toBe('Company Two');
      expect(link.relationshipStrength).toBe(1.0);
      expect(link.sharedEvidence).toHaveLength(1);
      expect(link.sharedEvidence[0].id).toBe('e2');
      expect(link.supportingRecordIds).toEqual(['rec-e2']);
    });

    it('calculates correct strength across multiple shipments', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1', name: 'Alpha' }),
          makeNode({ id: 'ent-2', name: 'Beta' }),
          makeNode({ id: 'ent-3', name: 'Gamma' }),
          makeNode({ id: 'ship-1', type: 'vessel', name: 'S1' }),
          makeNode({ id: 'ship-2', type: 'vessel', name: 'S2' }),
          makeNode({ id: 'ship-3', type: 'vessel', name: 'S3' }),
        ],
        [
          // ent-1 on all 3 shipments
          makeTradeEdge({ id: 'e1-1', from: 'ent-1', to: 'ship-1', record_id: 'r1' }),
          makeTradeEdge({ id: 'e2-1', from: 'ent-1', to: 'ship-2', record_id: 'r2' }),
          makeTradeEdge({ id: 'e3-1', from: 'ent-1', to: 'ship-3', record_id: 'r3' }),
          // ent-2 on ship-1 and ship-2 → strength 2/3
          makeTradeEdge({ id: 'e1-2', from: 'ent-2', to: 'ship-1', record_id: 'r1' }),
          makeTradeEdge({ id: 'e2-2', from: 'ent-2', to: 'ship-2', type: 'shipper_on', record_id: 'r2' }),
          // ent-3 on ship-3 only → strength 1/3
          makeTradeEdge({ id: 'e3-3', from: 'ent-3', to: 'ship-3', record_id: 'r3' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });

      expect(result.totalFocalShipmentCount).toBe(3);
      expect(result.links).toHaveLength(2);

      // First: ent-2 with strength 2/3 ≈ 0.6667
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
      expect(result.links[0].relationshipStrength).toBeCloseTo(0.6667, 4);
      expect(result.links[0].sharedEvidence.map(e => e.id)).toEqual(['e1-2', 'e2-2']);
      expect(result.links[0].supportingRecordIds).toEqual(['r1', 'r2']);

      // Second: ent-3 with strength 1/3 ≈ 0.3333
      expect(result.links[1].linkedEntities.entityId).toBe('ent-3');
      expect(result.links[1].relationshipStrength).toBeCloseTo(0.3333, 4);
    });

    it('handles both consignee_on and shipper_on edge types', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1', type: 'shipper_on' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1', type: 'consignee_on' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
      expect(result.links[0].relationshipStrength).toBe(1.0);
    });

    it('handles bidirectional edge references (from = shipment, to = entity)', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ship-1', to: 'ent-1' }),
          makeTradeEdge({ id: 'e2', from: 'ship-1', to: 'ent-2' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
    });
  });

  // ── Empty Inputs ────────────────────────────────────────────────────────────

  describe('empty inputs', () => {
    it('returns empty links for completely empty graph', () => {
      const graph = makeGraph([], []);
      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });

      expect(result.focalEntityId).toBe('ent-1');
      expect(result.totalFocalShipmentCount).toBe(0);
      expect(result.links).toEqual([]);
    });

    it('returns empty links when focal entity has no edges', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          // Only ent-2 is on a shipment, not ent-1
          makeTradeEdge({ id: 'e1', from: 'ent-2', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.totalFocalShipmentCount).toBe(0);
      expect(result.links).toEqual([]);
    });

    it('returns empty links when focal entity is alone on all shipments', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
          makeNode({ id: 'ship-2', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-1', to: 'ship-2' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.totalFocalShipmentCount).toBe(2);
      expect(result.links).toEqual([]);
    });

    it('returns empty links when focal entity only has non-trade edges', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
        ],
        [
          {
            id: 'e1', from: 'ent-1', to: 'ent-2',
            type: 'director_of', source_dataset: 'registry',
            record_id: 'r1', extraction_method: 'registry_filing',
            reliability_tier: 1,
          },
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.totalFocalShipmentCount).toBe(0);
      expect(result.links).toEqual([]);
    });

    it('returns zero links when entity_id does not exist in graph', () => {
      const graph = makeGraph(
        [makeNode({ id: 'ent-1' })],
        [makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' })]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'nonexistent' });
      expect(result.totalFocalShipmentCount).toBe(0);
      expect(result.links).toEqual([]);
    });
  });

  // ── Duplicate Data ──────────────────────────────────────────────────────────

  describe('duplicate data', () => {
    it('deduplicates evidence edges by edge ID', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1', record_id: 'r1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1', record_id: 'r1' }),
          // Duplicate edge for ent-2 with same ID
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1', record_id: 'r1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      // Only one unique edge ID 'e2', even though it appeared twice
      expect(result.links[0].sharedEvidence).toHaveLength(1);
    });

    it('deduplicates supporting record IDs', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1', record_id: 'r1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1', type: 'consignee_on', record_id: 'r1' }),
          makeTradeEdge({ id: 'e3', from: 'ent-2', to: 'ship-1', type: 'shipper_on', record_id: 'r1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      // Two unique edges (e2, e3) but same record_id → deduplicated
      expect(result.links[0].sharedEvidence.map(e => e.id)).toEqual(['e2', 'e3']);
      expect(result.links[0].supportingRecordIds).toEqual(['r1']);
    });

    it('counts shared shipments correctly even with multiple edges per shipment', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1', type: 'consignee_on' }),
          makeTradeEdge({ id: 'e3', from: 'ent-2', to: 'ship-1', type: 'shipper_on' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      // Only 1 shared shipment (ship-1), not 2
      expect(result.totalFocalShipmentCount).toBe(1);
      expect(result.links[0].relationshipStrength).toBe(1.0);
    });
  });

  // ── Missing Optional Fields ─────────────────────────────────────────────────

  describe('missing optional fields', () => {
    it('handles orphan peer entity IDs (entity node not in graph)', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1', name: 'Focal' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
          // ent-2 is NOT in the nodes list
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
      expect(result.links[0].linkedEntities.entity).toBeUndefined();
      // Should still compute strength and evidence correctly
      expect(result.links[0].relationshipStrength).toBe(1.0);
    });

    it('handles edges with optional fields (observed_date, value)', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1', observed_date: '2025-01-01' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1' }), // no observed_date
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
    });

    it('handles focal entity node missing from node list (but present in edges)', () => {
      const graph = makeGraph(
        [
          // ent-1 NOT in nodes
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-2', to: 'ship-1' }),
        ]
      );

      // Should still work via adjacency index
      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-2');
    });
  });

  // ── Invalid / Unusual Inputs ────────────────────────────────────────────────

  describe('invalid and unusual inputs', () => {
    it('ignores non-trade edge types when computing co-consignees', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ent-2' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1' }),
          // Non-trade edge on the same shipment — should be ignored
          {
            id: 'e2', from: 'ent-2', to: 'ship-1',
            type: 'director_of', source_dataset: 'registry',
            record_id: 'r2', extraction_method: 'registry_filing',
            reliability_tier: 1,
          },
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toEqual([]);
    });

    it('does not include the focal entity as its own peer', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'ent-1' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          // Focal entity has two edges to the same shipment
          makeTradeEdge({ id: 'e1', from: 'ent-1', to: 'ship-1', type: 'consignee_on' }),
          makeTradeEdge({ id: 'e2', from: 'ent-1', to: 'ship-1', type: 'shipper_on' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'ent-1' });
      expect(result.links).toEqual([]);
    });

    it('handles graph with many entities on a single large shipment', () => {
      const peerCount = 20;
      const nodes: EntityNode[] = [
        makeNode({ id: 'focal' }),
        makeNode({ id: 'ship-1', type: 'vessel' }),
      ];
      const edges: EvidenceEdge[] = [
        makeTradeEdge({ id: 'e-focal', from: 'focal', to: 'ship-1' }),
      ];

      for (let i = 0; i < peerCount; i++) {
        const peerId = `peer-${String(i).padStart(3, '0')}`;
        nodes.push(makeNode({ id: peerId }));
        edges.push(makeTradeEdge({ id: `e-${peerId}`, from: peerId, to: 'ship-1' }));
      }

      const graph = makeGraph(nodes, edges);
      const result = coConsigneeLinks(graph, { entity_id: 'focal' });

      expect(result.links).toHaveLength(peerCount);
      // All peers have strength 1.0 (all on the single shipment)
      for (const link of result.links) {
        expect(link.relationshipStrength).toBe(1.0);
      }
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('sorts links descending by strength', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'peer-a' }),
          makeNode({ id: 'peer-b' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
          makeNode({ id: 'ship-2', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'focal', to: 'ship-2' }),
          // peer-a on both shipments → strength 1.0
          makeTradeEdge({ id: 'e3', from: 'peer-a', to: 'ship-1' }),
          makeTradeEdge({ id: 'e4', from: 'peer-a', to: 'ship-2' }),
          // peer-b on only ship-1 → strength 0.5
          makeTradeEdge({ id: 'e5', from: 'peer-b', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.links[0].linkedEntities.entityId).toBe('peer-a');
      expect(result.links[0].relationshipStrength).toBe(1.0);
      expect(result.links[1].linkedEntities.entityId).toBe('peer-b');
      expect(result.links[1].relationshipStrength).toBe(0.5);
    });

    it('breaks ties in strength by lexicographic ascending entity ID', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'ent-B' }),
          makeNode({ id: 'ent-A' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'ent-B', to: 'ship-1' }),
          makeTradeEdge({ id: 'e3', from: 'ent-A', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.links).toHaveLength(2);
      expect(result.links[0].linkedEntities.entityId).toBe('ent-A');
      expect(result.links[1].linkedEntities.entityId).toBe('ent-B');
    });

    it('sorts sharedEvidence ascending by edge ID', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'peer' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          // Multiple edges for 'peer' on same shipment with different IDs
          makeTradeEdge({ id: 'e-z', from: 'peer', to: 'ship-1', type: 'shipper_on', record_id: 'r1' }),
          makeTradeEdge({ id: 'e-a', from: 'peer', to: 'ship-1', type: 'consignee_on', record_id: 'r2' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.links[0].sharedEvidence.map(e => e.id)).toEqual(['e-a', 'e-z']);
    });

    it('sorts supportingRecordIds ascending', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'peer' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'peer', to: 'ship-1', record_id: 'rec-z' }),
          makeTradeEdge({ id: 'e3', from: 'peer', to: 'ship-1', type: 'shipper_on', record_id: 'rec-a' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.links[0].supportingRecordIds).toEqual(['rec-a', 'rec-z']);
    });

    it('relationship strength is rounded to 4 decimal places', () => {
      // 1/3 = 0.33333... → should be 0.3333
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'peer' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
          makeNode({ id: 'ship-2', type: 'vessel' }),
          makeNode({ id: 'ship-3', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'focal', to: 'ship-2' }),
          makeTradeEdge({ id: 'e3', from: 'focal', to: 'ship-3' }),
          makeTradeEdge({ id: 'e4', from: 'peer', to: 'ship-1' }),
        ]
      );

      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.links[0].relationshipStrength).toBe(0.3333);
    });

    it('relationship strength is 0 when totalFocalShipmentCount is 0', () => {
      const graph = makeGraph([], []);
      const result = coConsigneeLinks(graph, { entity_id: 'focal' });
      expect(result.totalFocalShipmentCount).toBe(0);
      // No links should be present at all in this case
      expect(result.links).toEqual([]);
    });
  });

  // ── Determinism ─────────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('produces identical results across multiple invocations', () => {
      const graph = makeGraph(
        [
          makeNode({ id: 'focal' }),
          makeNode({ id: 'peer-a' }),
          makeNode({ id: 'peer-b' }),
          makeNode({ id: 'ship-1', type: 'vessel' }),
          makeNode({ id: 'ship-2', type: 'vessel' }),
        ],
        [
          makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
          makeTradeEdge({ id: 'e2', from: 'focal', to: 'ship-2' }),
          makeTradeEdge({ id: 'e3', from: 'peer-a', to: 'ship-1' }),
          makeTradeEdge({ id: 'e4', from: 'peer-b', to: 'ship-1' }),
          makeTradeEdge({ id: 'e5', from: 'peer-b', to: 'ship-2' }),
        ]
      );

      const result1 = coConsigneeLinks(graph, { entity_id: 'focal' });
      const result2 = coConsigneeLinks(graph, { entity_id: 'focal' });
      const result3 = coConsigneeLinks(graph, { entity_id: 'focal' });

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('is deterministic regardless of edge insertion order', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'focal' }),
        makeNode({ id: 'peer-a' }),
        makeNode({ id: 'peer-b' }),
        makeNode({ id: 'ship-1', type: 'vessel' }),
      ];

      const edgesForward: EvidenceEdge[] = [
        makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
        makeTradeEdge({ id: 'e2', from: 'peer-a', to: 'ship-1' }),
        makeTradeEdge({ id: 'e3', from: 'peer-b', to: 'ship-1' }),
      ];

      const edgesReverse: EvidenceEdge[] = [
        makeTradeEdge({ id: 'e3', from: 'peer-b', to: 'ship-1' }),
        makeTradeEdge({ id: 'e2', from: 'peer-a', to: 'ship-1' }),
        makeTradeEdge({ id: 'e1', from: 'focal', to: 'ship-1' }),
      ];

      const resultFwd = coConsigneeLinks(makeGraph(nodes, edgesForward), { entity_id: 'focal' });
      const resultRev = coConsigneeLinks(makeGraph(nodes, edgesReverse), { entity_id: 'focal' });

      expect(resultFwd.links.length).toBe(resultRev.links.length);
      expect(resultFwd.links.map(l => l.linkedEntities.entityId)).toEqual(
        resultRev.links.map(l => l.linkedEntities.entityId)
      );
      expect(resultFwd.links.map(l => l.relationshipStrength)).toEqual(
        resultRev.links.map(l => l.relationshipStrength)
      );
    });
  });
});
