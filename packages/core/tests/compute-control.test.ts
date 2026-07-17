import { describe, expect, it } from 'vitest';
import { computeControl } from '../src/algorithms/compute-control.js';
import type { ControlPathResult } from '../src/algorithms/all-control-paths.js';
import type { EvidenceEdge } from '../src/types.js';

describe('computeControl()', () => {
  // Helper to create a mock EvidenceEdge
  const createMockEdge = (id: string, from: string, to: string, value?: number): EvidenceEdge => ({
    id,
    from,
    to,
    type: 'owns_pct',
    value,
    source_dataset: 'synthetic',
    record_id: `rec-${id}`,
    extraction_method: 'registry_filing',
    reliability_tier: 1,
  });

  // Helper to create a mock ControlPathResult
  const createMockPath = (edges: EvidenceEdge[], hasCycle = false): ControlPathResult => ({
    path: edges,
    percentages: edges.map((e) => e.value ?? 0),
    metadata: {
      depth: edges.length,
      hasCycle,
    },
  });

  it('handles empty input paths correctly', () => {
    const result = computeControl([]);
    expect(result.effectiveControl).toBe(0);
    expect(result.contributingPaths).toHaveLength(0);
    expect(result.ownershipBreakdown).toHaveLength(0);
    expect(result.thresholdReached).toBe(false);
    expect(result.explanation).toBe('No ownership paths found.');
  });

  it('calculates control for a single path correctly', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', 0.5);
    const edge2 = createMockEdge('e2', 'B', 'C', 0.4);
    const path = createMockPath([edge1, edge2]);

    const result = computeControl([path]);
    expect(result.effectiveControl).toBeCloseTo(0.2); // 0.5 * 0.4 = 0.2
    expect(result.contributingPaths).toHaveLength(1);
    expect(result.contributingPaths[0].path_control).toBeCloseTo(0.2);
    expect(result.ownershipBreakdown).toHaveLength(1);
    expect(result.ownershipBreakdown[0]).toEqual({
      path: 'A -> B -> C',
      control: 0.2,
    });
    expect(result.thresholdReached).toBe(false); // 0.2 < 0.25
    expect(result.explanation).toContain('Total effective control is 20.00%');
    expect(result.explanation).toContain('Path [A -> B -> C]: 50.0% × 40.0% = 20.00%');
  });

  it('aggregates control for parallel paths and meets 25% threshold', () => {
    // Path 1: A -> B -> D (0.5 * 0.4 = 0.20)
    const e1 = createMockEdge('e1', 'A', 'B', 0.5);
    const e2 = createMockEdge('e2', 'B', 'D', 0.4);
    const path1 = createMockPath([e1, e2]);

    // Path 2: A -> C -> D (0.6 * 0.2 = 0.12)
    const e3 = createMockEdge('e3', 'A', 'C', 0.6);
    const e4 = createMockEdge('e4', 'C', 'D', 0.2);
    const path2 = createMockPath([e3, e4]);

    const result = computeControl([path1, path2]);
    expect(result.effectiveControl).toBeCloseTo(0.32); // 0.20 + 0.12 = 0.32
    expect(result.contributingPaths).toHaveLength(2);
    expect(result.thresholdReached).toBe(true); // 0.32 >= 0.25
    expect(result.explanation).toContain('Total effective control is 32.00% (meets 25% threshold)');
  });

  it('deduplicates identical paths', () => {
    const e1 = createMockEdge('e1', 'A', 'B', 0.5);
    const e2 = createMockEdge('e2', 'B', 'C', 0.4);
    const path1 = createMockPath([e1, e2]);
    const path2 = createMockPath([e1, e2]); // Duplicate

    const result = computeControl([path1, path2]);
    expect(result.effectiveControl).toBeCloseTo(0.2);
    expect(result.contributingPaths).toHaveLength(1);
    expect(result.ownershipBreakdown).toHaveLength(1);
  });

  it('filters out paths containing loops (cycles)', () => {
    // Cycle path: A -> B -> C -> B -> D
    const e1 = createMockEdge('e1', 'A', 'B', 0.5);
    const e2 = createMockEdge('e2', 'B', 'C', 0.4);
    const e3 = createMockEdge('e3', 'C', 'B', 0.8); // Back edge (loop)
    const e4 = createMockEdge('e4', 'B', 'D', 0.6);
    const cyclicPath = createMockPath([e1, e2, e3, e4]);

    // Valid path: A -> E -> D
    const e5 = createMockEdge('e5', 'A', 'E', 0.5);
    const e6 = createMockEdge('e6', 'E', 'D', 0.4);
    const validPath = createMockPath([e5, e6]);

    const result = computeControl([cyclicPath, validPath]);
    expect(result.effectiveControl).toBeCloseTo(0.2); // Only valid path counted (0.5 * 0.4 = 0.2)
    expect(result.contributingPaths).toHaveLength(1);
    expect(result.contributingPaths[0].path[0].id).toBe('e5');
  });

  it('defaults missing percentage to 0', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', 0.5);
    const edge2 = createMockEdge('e2', 'B', 'C', undefined); // Missing percentage
    const path = createMockPath([edge1, edge2]);

    const result = computeControl([path]);
    expect(result.effectiveControl).toBe(0);
    expect(result.contributingPaths).toHaveLength(1);
    expect(result.contributingPaths[0].path_control).toBe(0);
  });

  it('throws RangeError for invalid ownership values (< 0)', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', -0.5); // Invalid
    const path = createMockPath([edge1]);

    expect(() => computeControl([path])).toThrow(RangeError);
  });

  it('throws RangeError for invalid ownership values (> 1)', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', 1.5); // Invalid
    const path = createMockPath([edge1]);

    expect(() => computeControl([path])).toThrow(RangeError);
  });

  it('throws RangeError for NaN values', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', NaN); // Invalid
    const path = createMockPath([edge1]);

    expect(() => computeControl([path])).toThrow(RangeError);
  });

  it('respects a custom threshold options parameter', () => {
    const edge1 = createMockEdge('e1', 'A', 'B', 0.3);
    const path = createMockPath([edge1]);

    // Default threshold is 0.25 (meets)
    const result1 = computeControl([path]);
    expect(result1.thresholdReached).toBe(true);

    // Custom threshold of 0.40 (does not meet)
    const result2 = computeControl([path], { threshold: 0.4 });
    expect(result2.thresholdReached).toBe(false);
  });
});
