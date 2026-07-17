import { describe, expect, it } from 'vitest';
import { GraphManager } from '../src/graph/graph-manager.js';
import { allControlPaths } from '../src/algorithms/all-control-paths.js';
import { EntityNotFoundError } from '../src/graph/errors.js';
import type { EvidenceEdge } from '../src/types.js';

describe('allControlPaths()', () => {
  // Helper to create a base graph with standard entities
  const createBaseGraph = () => {
    const gm = new GraphManager();
    gm.addEntity({ id: 'A', type: 'company', name: 'Company A', jurisdiction: 'US', attributes: {} });
    gm.addEntity({ id: 'B', type: 'company', name: 'Company B', jurisdiction: 'UK', attributes: {} });
    gm.addEntity({ id: 'C', type: 'company', name: 'Company C', jurisdiction: 'DE', attributes: {} });
    gm.addEntity({ id: 'D', type: 'person', name: 'Person D', jurisdiction: 'IN', attributes: {} });
    gm.addEntity({ id: 'E', type: 'company', name: 'Company E', jurisdiction: 'SG', attributes: {} });
    return gm;
  };

  // Helper to create an owns_pct edge
  const createOwnsEdge = (id: string, from: string, to: string, pct: number): EvidenceEdge => ({
    id,
    from,
    to,
    type: 'owns_pct',
    value: pct,
    source_dataset: 'synthetic',
    record_id: `rec-${id}`,
    extraction_method: 'registry_filing',
    reliability_tier: 1,
  });

  it('throws EntityNotFoundError if source entity is missing', () => {
    const gm = createBaseGraph();
    expect(() =>
      allControlPaths(gm, { from: 'X', to: 'B' })
    ).toThrow(EntityNotFoundError);
  });

  it('throws EntityNotFoundError if target entity is missing', () => {
    const gm = createBaseGraph();
    expect(() =>
      allControlPaths(gm, { from: 'A', to: 'Y' })
    ).toThrow(EntityNotFoundError);
  });

  it('returns empty list if there are no edges in the graph', () => {
    const gm = createBaseGraph();
    const results = allControlPaths(gm, { from: 'A', to: 'C' });
    expect(results).toEqual([]);
  });

  it('returns a single direct path', () => {
    const gm = createBaseGraph();
    const edge1 = createOwnsEdge('e1', 'A', 'B', 0.6);
    const edge2 = createOwnsEdge('e2', 'B', 'C', 0.7);
    gm.addRelationship(edge1);
    gm.addRelationship(edge2);

    const results = allControlPaths(gm, { from: 'A', to: 'C' });
    expect(results).toHaveLength(1);
    expect(results[0].path).toEqual([edge1, edge2]);
    expect(results[0].percentages).toEqual([0.6, 0.7]);
    expect(results[0].metadata.depth).toBe(2);
    expect(results[0].metadata.hasCycle).toBe(false);
  });

  it('returns multiple parallel paths', () => {
    const gm = createBaseGraph();
    // Path 1: A -> B -> D
    const edgeAB = createOwnsEdge('eAB', 'A', 'B', 0.5);
    const edgeBD = createOwnsEdge('eBD', 'B', 'D', 0.4);
    // Path 2: A -> C -> D
    const edgeAC = createOwnsEdge('eAC', 'A', 'C', 0.3);
    const edgeCD = createOwnsEdge('eCD', 'C', 'D', 0.2);

    gm.addRelationship(edgeAB);
    gm.addRelationship(edgeBD);
    gm.addRelationship(edgeAC);
    gm.addRelationship(edgeCD);

    const results = allControlPaths(gm, { from: 'A', to: 'D' });
    expect(results).toHaveLength(2);

    // Verify both paths are found
    const path1 = results.find((r) => r.path[0].id === 'eAB');
    const path2 = results.find((r) => r.path[0].id === 'eAC');

    expect(path1).toBeDefined();
    expect(path1!.path).toEqual([edgeAB, edgeBD]);
    expect(path1!.percentages).toEqual([0.5, 0.4]);
    expect(path1!.metadata.depth).toBe(2);

    expect(path2).toBeDefined();
    expect(path2!.path).toEqual([edgeAC, edgeCD]);
    expect(path2!.percentages).toEqual([0.3, 0.2]);
    expect(path2!.metadata.depth).toBe(2);
  });

  it('respects configurable maximum depth', () => {
    const gm = createBaseGraph();
    // Path: A -> B -> C -> E (length 3)
    const e1 = createOwnsEdge('e1', 'A', 'B', 0.8);
    const e2 = createOwnsEdge('e2', 'B', 'C', 0.7);
    const e3 = createOwnsEdge('e3', 'C', 'E', 0.6);

    gm.addRelationship(e1);
    gm.addRelationship(e2);
    gm.addRelationship(e3);

    // With max depth 2, cannot reach E
    const resultsDepth2 = allControlPaths(gm, { from: 'A', to: 'E', maxDepth: 2 });
    expect(resultsDepth2).toHaveLength(0);

    // With max depth 3, can reach E
    const resultsDepth3 = allControlPaths(gm, { from: 'A', to: 'E', maxDepth: 3 });
    expect(resultsDepth3).toHaveLength(1);
    expect(resultsDepth3[0].path).toEqual([e1, e2, e3]);
  });

  it('respects minEdgePct parameter', () => {
    const gm = createBaseGraph();
    // Path 1: A -> B -> D (0.5 -> 0.1)
    const edgeAB = createOwnsEdge('eAB', 'A', 'B', 0.5);
    const edgeBD = createOwnsEdge('eBD', 'B', 'D', 0.1);
    // Path 2: A -> C -> D (0.5 -> 0.4)
    const edgeAC = createOwnsEdge('eAC', 'A', 'C', 0.5);
    const edgeCD = createOwnsEdge('eCD', 'C', 'D', 0.4);

    gm.addRelationship(edgeAB);
    gm.addRelationship(edgeBD);
    gm.addRelationship(edgeAC);
    gm.addRelationship(edgeCD);

    // minEdgePct = 0.2 filters out B -> D, leaving only A -> C -> D
    const results = allControlPaths(gm, { from: 'A', to: 'D', minEdgePct: 0.2 });
    expect(results).toHaveLength(1);
    expect(results[0].path).toEqual([edgeAC, edgeCD]);
  });

  it('avoids infinite loops and detects cycles correctly', () => {
    const gm = createBaseGraph();
    // Cycle: A -> B -> C -> A
    const eAB = createOwnsEdge('eAB', 'A', 'B', 0.5);
    const eBC = createOwnsEdge('eBC', 'B', 'C', 0.6);
    const eCA = createOwnsEdge('eCA', 'C', 'A', 0.7);
    // Branch to target: B -> D
    const eBD = createOwnsEdge('eBD', 'B', 'D', 0.8);

    gm.addRelationship(eAB);
    gm.addRelationship(eBC);
    gm.addRelationship(eCA);
    gm.addRelationship(eBD);

    // Should find the path A -> B -> D and terminate despite the cycle A -> B -> C -> A
    const results = allControlPaths(gm, { from: 'A', to: 'D' });
    expect(results).toHaveLength(1);
    expect(results[0].path).toEqual([eAB, eBD]);
  });

  it('does not traverse non-ownership edges', () => {
    const gm = createBaseGraph();
    const ownsEdge = createOwnsEdge('owns', 'A', 'B', 0.5);
    gm.addRelationship(ownsEdge);

    // Add a director_of relationship
    const directorEdge: EvidenceEdge = {
      id: 'dir',
      from: 'B',
      to: 'C',
      type: 'director_of',
      source_dataset: 'synthetic',
      record_id: 'rec-dir',
      extraction_method: 'registry_filing',
      reliability_tier: 1,
    };
    gm.addRelationship(directorEdge);

    const results = allControlPaths(gm, { from: 'A', to: 'C' });
    expect(results).toHaveLength(0); // Should not traverse director_of edge
  });

  it('handles same source and target node case', () => {
    const gm = createBaseGraph();
    const results = allControlPaths(gm, { from: 'A', to: 'A' });
    expect(results).toHaveLength(1);
    expect(results[0].path).toEqual([]);
    expect(results[0].percentages).toEqual([]);
    expect(results[0].metadata.depth).toBe(0);
  });
});
