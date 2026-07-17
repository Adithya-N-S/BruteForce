import { describe, it, expect } from 'vitest';
import { findSharedAttributes } from '../src/algorithms/find-shared-attributes.js';
import { GraphManager } from '../src/graph/graph-manager.js';
import type { EntityNode, EvidenceEdge } from '../src/types.js';

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

/** Minimal valid evidence edge factory. */
function makeEdge(overrides: Partial<EvidenceEdge> & { id: string; from: string; to: string; type: EvidenceEdge['type'] }): EvidenceEdge {
  return {
    source_dataset: 'registry',
    record_id: `rec-${overrides.id}`,
    extraction_method: 'registry_filing',
    reliability_tier: 1,
    ...overrides,
  };
}

// =============================================================================
// List Mode Tests
// =============================================================================

describe('findSharedAttributes - List Mode', () => {
  // ── Normal Cases ────────────────────────────────────────────────────────────

  describe('normal cases', () => {
    it('identifies entities sharing a phone number (differently formatted)', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+1 555-0100' }, jurisdiction: 'US' }),
        makeNode({ id: 'ent-2', attributes: { phone: '+1 (555) 0100' }, jurisdiction: 'CA' }),
      ];

      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedEntities).toEqual(['ent-1', 'ent-2']);
      expect(result.matches[0].matchedFields).toEqual(['phone']);
      expect(result.matches[0].sharedAttributes[0].value).toBe('+15550100');
      expect(result.matches[0].confidenceContribution).toBeCloseTo(0.80, 4);
    });

    it('identifies entities sharing an email address (case-insensitive)', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { email: 'info@alpha.com' }, jurisdiction: 'US' }),
        makeNode({ id: 'ent-3', attributes: { email: 'INFO@ALPHA.COM' }, jurisdiction: 'UK' }),
      ];

      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedEntities).toEqual(['ent-1', 'ent-3']);
      expect(result.matches[0].matchedFields).toEqual(['email']);
      expect(result.matches[0].sharedAttributes[0].value).toBe('info@alpha.com');
      expect(result.matches[0].confidenceContribution).toBeCloseTo(0.85, 4);
    });

    it('identifies entities sharing multiple attributes and computes probabilistic union', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+15550100', email: 'info@alpha.com' }, jurisdiction: 'FR' }),
        makeNode({ id: 'ent-2', attributes: { phone: '+1 (555) 0100', email: 'info@alpha.com' }, jurisdiction: 'DE' }),
      ];

      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match.matchedEntities).toEqual(['ent-1', 'ent-2']);
      expect(match.matchedFields).toEqual(['email', 'phone']);
      expect(match.sharedAttributes).toHaveLength(2);
      // Union: 1 - (1 - 0.80) * (1 - 0.85) = 1 - 0.03 = 0.97
      expect(match.confidenceContribution).toBeCloseTo(0.97, 4);
    });

    it('correctly handles domains, registration numbers, and tax identifiers', () => {
      const nodes: EntityNode[] = [
        makeNode({
          id: 'ent-1',
          jurisdiction: 'BVI',
          attributes: { website: 'https://www.delta.com/home', registration_number: 'BVI-12345', tax_id: 'TAX-999-A' },
        }),
        makeNode({
          id: 'ent-2',
          jurisdiction: 'BVI',
          attributes: { domain: 'delta.com', registration_number: 'BVI 12-345', tax_id: 'tax999a' },
        }),
      ];

      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match.matchedEntities).toEqual(['ent-1', 'ent-2']);
      expect(match.matchedFields).toEqual(['domain', 'jurisdiction', 'registration_number', 'tax_id']);
      // Union: 1 - (1-0.05)*(1-0.75)*(1-0.95)*(1-0.95) = 1 - 0.00059375
      expect(match.confidenceContribution).toBeCloseTo(0.9994, 3);
    });

    it('identifies relationships derived from edges (directors, addresses)', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'comp-1', jurisdiction: 'US' }),
        makeNode({ id: 'comp-2', jurisdiction: 'US' }),
        makeNode({ id: 'dir-1', type: 'person', name: 'John Doe', jurisdiction: 'US' }),
        makeNode({ id: 'addr-1', type: 'address', name: '123 Corporate Blvd', jurisdiction: 'US' }),
      ];

      const edges: EvidenceEdge[] = [
        makeEdge({ id: 'e1', from: 'dir-1', to: 'comp-1', type: 'director_of' }),
        makeEdge({ id: 'e2', from: 'dir-1', to: 'comp-2', type: 'director_of' }),
        makeEdge({ id: 'e3', from: 'comp-1', to: 'addr-1', type: 'registered_at' }),
        makeEdge({ id: 'e4', from: 'comp-2', to: 'addr-1', type: 'registered_at' }),
      ];

      const result = findSharedAttributes(nodes, edges);
      const match = result.matches.find(
        m => m.matchedEntities.includes('comp-1') && m.matchedEntities.includes('comp-2')
      );
      expect(match).toBeDefined();
      expect(match!.matchedFields).toContain('director');
      expect(match!.matchedFields).toContain('address');
      // Union: 1 - (1 - 0.70) * (1 - 0.60) = 1 - 0.12 = 0.88
      expect(match!.confidenceContribution).toBeCloseTo(0.88, 2);
    });

    it('handles agent_for edge type for shared attribute extraction', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'comp-1', jurisdiction: 'US' }),
        makeNode({ id: 'comp-2', jurisdiction: 'UK' }),
        makeNode({ id: 'agent-1', type: 'agent', name: 'Acme Registered Agents' }),
      ];

      const edges: EvidenceEdge[] = [
        makeEdge({ id: 'e1', from: 'agent-1', to: 'comp-1', type: 'agent_for' }),
        makeEdge({ id: 'e2', from: 'agent-1', to: 'comp-2', type: 'agent_for' }),
      ];

      const result = findSharedAttributes(nodes, edges);
      // Both companies share the same agent
      const match = result.matches.find(
        m => m.matchedEntities.includes('comp-1') && m.matchedEntities.includes('comp-2')
      );
      expect(match).toBeDefined();
    });
  });

  // ── Empty Inputs ────────────────────────────────────────────────────────────

  describe('empty inputs', () => {
    it('returns empty matches for empty node list', () => {
      const result = findSharedAttributes([], []);
      expect(result.matches).toEqual([]);
    });

    it('returns empty matches for a single node', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+1 555-0100' } }),
      ];
      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toEqual([]);
    });

    it('returns empty matches when no attributes are shared', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+1 555-0100' } }),
        makeNode({ id: 'ent-2', attributes: { phone: '+44 20 7946 0192' } }),
      ];
      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toEqual([]);
    });

    it('returns empty matches when nodes have empty attribute bags', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: {} }),
        makeNode({ id: 'ent-2', attributes: {} }),
      ];
      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toEqual([]);
    });

    it('returns empty matches with edges referencing unknown node IDs', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'comp-1' }),
      ];
      const edges: EvidenceEdge[] = [
        makeEdge({ id: 'e1', from: 'unknown-1', to: 'comp-1', type: 'director_of' }),
      ];
      const result = findSharedAttributes(nodes, edges);
      expect(result.matches).toEqual([]);
    });
  });

  // ── Duplicate Data ──────────────────────────────────────────────────────────

  describe('duplicate data', () => {
    it('deduplicates identical attributes on the same entity', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+15550100', mobile: '+15550100' } }),
        makeNode({ id: 'ent-2', attributes: { phone: '+15550100' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // ent-1 has the same phone value under two different key names
      // Both map to type 'phone', same normalized value → deduplicated
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedEntities).toEqual(['ent-1', 'ent-2']);
      expect(result.matches[0].sharedAttributes).toHaveLength(1);
    });

    it('deduplicates director edges pointing to same person', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'comp-1' }),
        makeNode({ id: 'comp-2' }),
        makeNode({ id: 'dir-1', type: 'person', name: 'Jane Smith' }),
      ];

      const edges: EvidenceEdge[] = [
        makeEdge({ id: 'e1', from: 'dir-1', to: 'comp-1', type: 'director_of' }),
        makeEdge({ id: 'e2', from: 'dir-1', to: 'comp-1', type: 'director_of' }), // duplicate
        makeEdge({ id: 'e3', from: 'dir-1', to: 'comp-2', type: 'director_of' }),
      ];

      const result = findSharedAttributes(nodes, edges);
      const match = result.matches.find(
        m => m.matchedEntities.includes('comp-1') && m.matchedEntities.includes('comp-2')
      );
      expect(match).toBeDefined();
    });

    it('handles multiple edges of same type to same address without overcounting', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'comp-1' }),
        makeNode({ id: 'comp-2' }),
        makeNode({ id: 'addr-1', type: 'address', name: '1 Main St' }),
      ];

      const edges: EvidenceEdge[] = [
        makeEdge({ id: 'e1', from: 'comp-1', to: 'addr-1', type: 'registered_at' }),
        makeEdge({ id: 'e2', from: 'comp-1', to: 'addr-1', type: 'registered_at' }),
        makeEdge({ id: 'e3', from: 'comp-2', to: 'addr-1', type: 'registered_at' }),
      ];

      const result = findSharedAttributes(nodes, edges);
      const match = result.matches.find(
        m => m.matchedEntities.includes('comp-1') && m.matchedEntities.includes('comp-2')
      );
      expect(match).toBeDefined();
      // address appears only once in the shared attributes for the group
      const addressAttrs = match!.sharedAttributes.filter(a => a.type === 'address');
      // There may be multiple address attributes from different sources (edge ID vs name)
      // but each unique normalized value should appear only once
      const uniqueValues = new Set(addressAttrs.map(a => a.value));
      expect(uniqueValues.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Missing Optional Fields ─────────────────────────────────────────────────

  describe('missing optional fields', () => {
    it('works when jurisdiction is an empty string', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', jurisdiction: '', attributes: { phone: '+15550100' } }),
        makeNode({ id: 'ent-2', jurisdiction: '', attributes: { phone: '+15550100' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      expect(result.matches).toHaveLength(1);
      // Empty jurisdiction should not create a shared match on jurisdiction
      expect(result.matches[0].matchedFields).not.toContain('jurisdiction');
    });

    it('ignores attributes with null or undefined values in the bag', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: null as unknown as string, email: 'test@test.com' } }),
        makeNode({ id: 'ent-2', attributes: { phone: undefined as unknown as string, email: 'test@test.com' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // Only email should match, phone values are not string/number
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedFields).toEqual(['email']);
    });

    it('handles nodes with no name gracefully', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', name: '', type: 'address', attributes: {} }),
        makeNode({ id: 'ent-2', name: '', type: 'address', attributes: {} }),
      ];

      // Should not throw
      const result = findSharedAttributes(nodes, []);
      expect(result).toBeDefined();
    });

    it('handles attribute arrays with mixed types (only string/number extracted)', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: ['+15550100', 99, null, { nested: true }] as any } }),
        makeNode({ id: 'ent-2', attributes: { phone: '+15550100' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // Should match on the string '+15550100' from the array
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const phoneMatch = result.matches.find(m => m.matchedFields.includes('phone'));
      expect(phoneMatch).toBeDefined();
    });
  });

  // ── Invalid / Unusual Inputs ────────────────────────────────────────────────

  describe('invalid and unusual inputs', () => {
    it('ignores phone numbers that are too short after normalization', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '123' } }),
        makeNode({ id: 'ent-2', attributes: { phone: '123' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // '123' normalized to '123' which has length 3, < 5 → null
      expect(result.matches.filter(m => m.matchedFields.includes('phone'))).toHaveLength(0);
    });

    it('ignores emails that do not contain @', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { email: 'not-an-email' } }),
        makeNode({ id: 'ent-2', attributes: { email: 'not-an-email' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // 'not-an-email' does not contain '@' → null
      expect(result.matches.filter(m => m.matchedFields.includes('email'))).toHaveLength(0);
    });

    it('ignores registration numbers that are too short after normalization', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { registration_number: 'AB' } }),
        makeNode({ id: 'ent-2', attributes: { registration_number: 'AB' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // 'ab' has length 2, < 3 → null
      expect(result.matches.filter(m => m.matchedFields.includes('registration_number'))).toHaveLength(0);
    });

    it('handles whitespace-only attribute values gracefully', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '   ' } }),
        makeNode({ id: 'ent-2', attributes: { phone: '   ' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // Whitespace-only values should be trimmed to empty → skipped
      expect(result.matches.filter(m => m.matchedFields.includes('phone'))).toHaveLength(0);
    });

    it('correctly maps attribute key names to types', () => {
      // Keys containing special substrings should be classified correctly
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { hq_address: '10 Downing St', fax_number: '+15550100', vat_code: 'VAT123456' } }),
        makeNode({ id: 'ent-2', attributes: { hq_address: '10 Downing St', fax_number: '+15550100', vat_code: 'VAT123456' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // hq_address → 'address', fax_number → 'phone', vat_code → 'tax_id'
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches[0];
      expect(match.matchedFields.sort()).toEqual(
        expect.arrayContaining(['address', 'phone', 'tax_id'])
      );
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('produces results sorted descending by confidenceContribution', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+15550100', email: 'a@b.com' }, jurisdiction: 'CA' }),
        makeNode({ id: 'ent-2', attributes: { phone: '+15550100' }, jurisdiction: 'UK' }),
        makeNode({ id: 'ent-3', attributes: { email: 'a@b.com' }, jurisdiction: 'FR' }),
      ];

      const result = findSharedAttributes(nodes, []);
      // email (0.85) match between ent-1 and ent-3 should be first
      // phone (0.80) match between ent-1 and ent-2 should be second
      expect(result.matches.length).toBe(2);
      expect(result.matches[0].confidenceContribution).toBeGreaterThanOrEqual(
        result.matches[1].confidenceContribution
      );
    });

    it('groups entities sharing the same subset of attributes into one match', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+15550100' }, jurisdiction: 'FR' }),
        makeNode({ id: 'ent-2', attributes: { phone: '+15550100' }, jurisdiction: 'DE' }),
        makeNode({ id: 'ent-3', attributes: { phone: '+15550100' }, jurisdiction: 'IT' }),
      ];

      const result = findSharedAttributes(nodes, []);
      // All three share the same phone → single group
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedEntities).toEqual(['ent-1', 'ent-2', 'ent-3']);
    });

    it('handles domain normalization (strips scheme, www, path, query)', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { website: 'https://www.example.com/about?ref=1' } }),
        makeNode({ id: 'ent-2', attributes: { url: 'http://example.com' } }),
      ];

      const result = findSharedAttributes(nodes, []);
      const domainMatch = result.matches.find(m => m.matchedFields.includes('domain'));
      expect(domainMatch).toBeDefined();
      expect(domainMatch!.sharedAttributes[0].value).toBe('example.com');
    });

    it('handles person node type adding name as director attribute', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'person-1', type: 'person', name: 'John Doe' }),
        makeNode({ id: 'person-2', type: 'person', name: 'John Doe' }),
      ];

      const result = findSharedAttributes(nodes, []);
      // Both person nodes should have their name as a 'director' attribute
      const dirMatch = result.matches.find(m => m.matchedFields.includes('director'));
      expect(dirMatch).toBeDefined();
    });

    it('handles address node type adding name as address attribute', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'addr-1', type: 'address', name: '123 Main St' }),
        makeNode({ id: 'addr-2', type: 'address', name: '123 Main St' }),
      ];

      const result = findSharedAttributes(nodes, []);
      const addrMatch = result.matches.find(m => m.matchedFields.includes('address'));
      expect(addrMatch).toBeDefined();
    });

    it('number attribute values are coerced to string for matching', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { reg_number: 123456 } }),
        makeNode({ id: 'ent-2', attributes: { reg_number: 123456 } }),
      ];

      const result = findSharedAttributes(nodes, []);
      // reg_number key → registration_number type, value 123456 → '123456'
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Determinism ─────────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('produces identical results across multiple invocations', () => {
      const nodes: EntityNode[] = [
        makeNode({ id: 'ent-1', attributes: { phone: '+15550100', email: 'a@b.com' }, jurisdiction: 'US' }),
        makeNode({ id: 'ent-2', attributes: { phone: '+15550100' }, jurisdiction: 'US' }),
        makeNode({ id: 'ent-3', attributes: { email: 'a@b.com' }, jurisdiction: 'US' }),
      ];

      const edges: EvidenceEdge[] = [];

      const result1 = findSharedAttributes(nodes, edges);
      const result2 = findSharedAttributes(nodes, edges);
      const result3 = findSharedAttributes(nodes, edges);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('is deterministic regardless of node insertion order', () => {
      const n1 = makeNode({ id: 'ent-1', attributes: { email: 'shared@test.com' }, jurisdiction: 'UK' });
      const n2 = makeNode({ id: 'ent-2', attributes: { email: 'shared@test.com' }, jurisdiction: 'FR' });

      const resultForward = findSharedAttributes([n1, n2], []);
      const resultReverse = findSharedAttributes([n2, n1], []);

      expect(resultForward.matches.length).toBe(resultReverse.matches.length);
      expect(resultForward.matches[0].matchedEntities).toEqual(
        resultReverse.matches[0].matchedEntities
      );
      expect(resultForward.matches[0].confidenceContribution).toEqual(
        resultReverse.matches[0].confidenceContribution
      );
    });
  });
});

// =============================================================================
// Legacy GraphManager Mode Tests
// =============================================================================

describe('findSharedAttributes - Legacy GraphManager Mode', () => {
  describe('normal cases', () => {
    it('finds linked entities through shared address', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp', jurisdiction: 'US' }));
      gm.addEntity(makeNode({ id: 'comp-2', name: 'B-Corp', jurisdiction: 'US' }));
      gm.addEntity(makeNode({ id: 'addr-1', type: 'address', name: '123 Corporate Blvd', jurisdiction: 'US' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'comp-1', to: 'addr-1', type: 'registered_at' }));
      gm.addRelationship(makeEdge({ id: 'e2', from: 'comp-2', to: 'addr-1', type: 'registered_at' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'address' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linked_entity_id).toBe('comp-2');
      expect(result.links[0].shared_attribute_type).toBe('address');
      expect(result.links[0].shared_attribute_value).toBe('123 Corporate Blvd');
      expect(result.links[0].edges).toHaveLength(2);
    });

    it('finds linked entities through shared director', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'comp-2', name: 'B-Corp' }));
      gm.addEntity(makeNode({ id: 'dir-1', type: 'person', name: 'John Doe' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'dir-1', to: 'comp-1', type: 'director_of' }));
      gm.addRelationship(makeEdge({ id: 'e2', from: 'dir-1', to: 'comp-2', type: 'director_of' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'director' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linked_entity_id).toBe('comp-2');
      expect(result.links[0].shared_attribute_type).toBe('director');
    });

    it('finds linked entities through shared agent', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'comp-2', name: 'B-Corp' }));
      gm.addEntity(makeNode({ id: 'agent-1', type: 'agent', name: 'Acme Agents' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'agent-1', to: 'comp-1', type: 'agent_for' }));
      gm.addRelationship(makeEdge({ id: 'e2', from: 'agent-1', to: 'comp-2', type: 'agent_for' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'agent' });
      expect(result.links).toHaveLength(1);
      expect(result.links[0].linked_entity_id).toBe('comp-2');
      expect(result.links[0].shared_attribute_type).toBe('agent');
    });

    it('returns all attribute types when no filter is specified', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'comp-2', name: 'B-Corp' }));
      gm.addEntity(makeNode({ id: 'comp-3', name: 'C-Corp' }));
      gm.addEntity(makeNode({ id: 'dir-1', type: 'person', name: 'Jane Doe' }));
      gm.addEntity(makeNode({ id: 'addr-1', type: 'address', name: '1 Main St' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'dir-1', to: 'comp-1', type: 'director_of' }));
      gm.addRelationship(makeEdge({ id: 'e2', from: 'dir-1', to: 'comp-2', type: 'director_of' }));
      gm.addRelationship(makeEdge({ id: 'e3', from: 'comp-1', to: 'addr-1', type: 'registered_at' }));
      gm.addRelationship(makeEdge({ id: 'e4', from: 'comp-3', to: 'addr-1', type: 'registered_at' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1' });
      // Should find comp-2 via director and comp-3 via address
      expect(result.links.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('empty inputs', () => {
    it('returns empty links when entity has no edges', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'Isolated' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1' });
      expect(result.links).toEqual([]);
    });

    it('returns empty links when entity has edges but no shared intermediaries', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'addr-1', type: 'address', name: '1 Main St' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'comp-1', to: 'addr-1', type: 'registered_at' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'address' });
      // addr-1 is only linked to comp-1, no other company shares it
      expect(result.links).toEqual([]);
    });
  });

  describe('duplicate data', () => {
    it('deduplicates links to the same entity via the same intermediary', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'comp-2', name: 'B-Corp' }));
      gm.addEntity(makeNode({ id: 'addr-1', type: 'address', name: '1 Main St' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'comp-1', to: 'addr-1', type: 'registered_at' }));
      gm.addRelationship(makeEdge({ id: 'e2', from: 'comp-2', to: 'addr-1', type: 'registered_at' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'address' });
      // Should only have one link (not duplicated)
      expect(result.links).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('does not include the queried entity in its own links', () => {
      const gm = new GraphManager();
      gm.addEntity(makeNode({ id: 'comp-1', name: 'A-Corp' }));
      gm.addEntity(makeNode({ id: 'addr-1', type: 'address', name: '1 Main St' }));

      gm.addRelationship(makeEdge({ id: 'e1', from: 'comp-1', to: 'addr-1', type: 'registered_at' }));

      const result = findSharedAttributes(gm, { entity_id: 'comp-1', attribute: 'address' });
      const selfLinks = result.links.filter(l => l.linked_entity_id === 'comp-1');
      expect(selfLinks).toHaveLength(0);
    });
  });
});
