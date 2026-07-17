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
import type { ControlPath } from '../types.js';
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
/**
 * Deterministically computes the effective control from a list of paths.
 *
 * @param paths - The array of control path results returned from allControlPaths().
 * @param options - Optional configuration options.
 * @param options.threshold - The beneficial ownership threshold. Defaults to 0.25.
 * @returns The computed control result.
 * @throws {@link RangeError} if any ownership percentage value is outside the [0, 1] range.
 */
export declare function computeControl(paths: readonly ControlPathResult[], options?: {
    threshold?: number;
}): ComputeControlOutput;
//# sourceMappingURL=compute-control.d.ts.map