/**
 * @module algorithms/compute-control
 * @description
 * Deterministic control computation — the `compute_control` investigative primitive.
 *
 * ## Aggregation Strategy
 *
 * Control computation aggregates the ownership paths returned from `all_control_paths()`:
 *
 * 1. **Deduplication:** Filters out duplicate paths (paths traversing the exact same edge IDs).
 * 2. **Cycle Check:** Validates that each path is simple (no node visited more than once). Cyclic paths are discarded.
 * 3. **Validation:** Asserves that all ownership values along the path are within `[0, 1]`.
 *    - Values outside `[0, 1]` trigger a validation error.
 *    - Missing percentages (`undefined` or `null`) default to `0`.
 * 4. **Multiplication:** Multiplies the ownership percentages along each path to get the path control:
 *    $\text{path\_control} = \prod \text{value}_i$.
 * 5. **Summation:** Sums the path control values across all parallel paths to compute the total effective control:
 *    $\text{effectiveControl} = \sum \text{path\_control}_k$.
 * 6. **Threshold Check:** Evaluates if the total effective control is $\ge 25\%$ (0.25).
 * 7. **Explanation:** Emits a deterministic, mathematically rigorous step-by-step summary of the computation.
 *
 * @see 01_MASTER_CONTEXT.md §14.3 — `compute_control` contract
 */

import type { ControlPath, EvidenceEdge } from '../types.js';
import type { ControlPathResult } from './all-control-paths.js';

/**
 * Breakdown entry for a single contributing path.
 */
export interface OwnershipBreakdownEntry {
  /** Text representation of the path, e.g., "A -> B -> C". */
  readonly path: string;
  /** Calculated path control value (in [0, 1]). */
  readonly control: number;
}

/**
 * Result structure returned by computeControl().
 */
export interface ComputeControlOutput {
  /** Aggregate effective control fraction in [0, 1]. */
  readonly effectiveControl: number;

  /** List of paths that contribute to the aggregate control. */
  readonly contributingPaths: readonly ControlPath[];

  /** Math breakdown per contributing path. */
  readonly ownershipBreakdown: readonly OwnershipBreakdownEntry[];

  /** Whether the effective control meets or exceeds the beneficial ownership threshold (25%). */
  readonly thresholdReached: boolean;

  /** Human-readable deterministic explanation of the calculation. */
  readonly explanation: string;
}

function hasCycles(path: readonly EvidenceEdge[]): boolean {
  const firstEdge = path[0];
  if (!firstEdge) return false;

  const visitedNodes = new Set<string>();
  visitedNodes.add(firstEdge.from);

  for (const edge of path) {
    if (visitedNodes.has(edge.to)) {
      return true;
    }
    visitedNodes.add(edge.to);
  }

  return false;
}

/**
 * Generate a string representation of a path, e.g., "A -> B -> C".
 */
function getPathString(path: readonly EvidenceEdge[]): string {
  const firstEdge = path[0];
  if (!firstEdge) return "";
  const nodes = [firstEdge.from, ...path.map((edge) => edge.to)];
  return nodes.join(" -> ");
}

/**
 * Deterministically computes the effective control from a list of paths.
 *
 * @param paths - The array of control path results returned from allControlPaths().
 * @param options - Optional configuration options.
 * @param options.threshold - The beneficial ownership threshold. Defaults to 0.25.
 * @returns The computed control result.
 * @throws {@link RangeError} if any ownership percentage value is outside the [0, 1] range.
 */
export function computeControl(
  paths: readonly ControlPathResult[],
  options?: { threshold?: number }
): ComputeControlOutput {
  const threshold = options?.threshold ?? 0.25;

  if (paths.length === 0) {
    return {
      effectiveControl: 0,
      contributingPaths: [],
      ownershipBreakdown: [],
      thresholdReached: false,
      explanation: "No ownership paths found.",
    };
  }

  const seenPathKeys = new Set<string>();
  const contributingPaths: ControlPath[] = [];
  const ownershipBreakdown: OwnershipBreakdownEntry[] = [];
  let totalControl = 0;

  for (const pathResult of paths) {
    const { path } = pathResult;

    // 1. Skip empty paths (they have 0 hops and contribute nothing)
    if (path.length === 0) {
      continue;
    }

    // 2. Deduplication: unique key by joining edge IDs
    const pathKey = path.map((edge) => edge.id).join('|');
    if (seenPathKeys.has(pathKey)) {
      continue;
    }
    seenPathKeys.add(pathKey);

    // 3. Cycle Detection: discard paths containing cycles
    if (hasCycles(path)) {
      continue;
    }

    // 4. Calculate Path Control (multiplication)
    let pathControl = 1;
    for (const edge of path) {
      const val = edge.value;

      // Handle missing percentage: treat as 0
      if (val === undefined || val === null) {
        pathControl = 0;
        break;
      }

      // Handle invalid percentage values: throw RangeError
      if (isNaN(val) || val < 0 || val > 1) {
        throw new RangeError(
          `Invalid ownership percentage value: ${val} on edge ${edge.id}. Value must be in range [0, 1].`
        );
      }

      pathControl *= val;
    }

    // Summing control
    totalControl += pathControl;

    // Add to contributing paths
    contributingPaths.push({
      path,
      path_control: pathControl,
    });

    // Add to breakdown
    ownershipBreakdown.push({
      path: getPathString(path),
      control: pathControl,
    });
  }

  // Ensure totalControl doesn't exceed 1.0 (float rounding could theoretically push it slightly over, clamp it)
  const effectiveControl = Math.min(1.0, Math.max(0.0, totalControl));
  const thresholdReached = effectiveControl >= threshold;

  // Build the explanation text
  let explanation = "";
  if (contributingPaths.length === 0) {
    explanation = "No contributing ownership paths found.";
  } else {
    const breakdownStrings = contributingPaths.map((cp) => {
      const pathStr = getPathString(cp.path);
      const mathStr = cp.path
        .map((edge) => {
          const val = edge.value ?? 0;
          return `${(val * 100).toFixed(1)}%`;
        })
        .join(" × ");
      return `Path [${pathStr}]: ${mathStr} = ${(cp.path_control * 100).toFixed(2)}%`;
    });

    const thresholdStr = (threshold * 100).toFixed(0);
    const controlStr = (effectiveControl * 100).toFixed(2);

    explanation = `Total effective control is ${controlStr}% (${
      thresholdReached ? "meets" : "does not meet"
    } ${thresholdStr}% threshold). `;
    explanation += `Contributing paths:\n- ${breakdownStrings.join("\n- ")}`;
  }

  return {
    effectiveControl,
    contributingPaths,
    ownershipBreakdown,
    thresholdReached,
    explanation,
  };
}
