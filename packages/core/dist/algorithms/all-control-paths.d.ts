/**
 * @module algorithms/all-control-paths
 * @description
 * Traverses the evidence graph to find all ownership paths between two entities.
 *
 * ## Invariants & Design
 * - **Deterministic:** Pure algorithm, no I/O, no network, no LLMs.
 * - **DFS-based Traversal:** Finds all paths from `from` to `to` using Depth-First Search.
 * - **Cycle Detection & Loop Avoidance:** Tracks visited nodes along the current search path.
 *   If a node is visited that is already in the path, it is classified as a cycle,
 *   preventing infinite loops.
 * - **Configurable Max Depth:** Limits the recursion depth to prevent search-space explosion.
 * - **Configurable Min Ownership Percentage:** Optionally filters out ownership edges below a threshold.
 *
 * @see 01_MASTER_CONTEXT.md §14.3 — `all_control_paths` contract
 */
import type { EntityId, EvidenceEdge } from '../types.js';
import type { GraphManager } from '../graph/graph-manager.js';
/**
 * Result structure representing a single control/ownership path.
 */
export interface ControlPathResult {
    /** The ordered sequence of edges forming this control chain. */
    readonly path: readonly EvidenceEdge[];
    /**
     * The ownership percentages (as values in [0, 1]) along each hop of the path.
     * Corresponds 1-to-1 with the edges in `path`.
     */
    readonly percentages: readonly number[];
    /** Metadata associated with the path discovery. */
    readonly metadata: {
        /** Length of the path (number of edges). */
        readonly depth: number;
        /** Whether the path encountered any cycles during its exploration. */
        readonly hasCycle: boolean;
    };
}
/**
 * Traverses an ownership graph and finds all control/ownership paths between two entities.
 *
 * @param graph - The GraphManager instance containing the evidence graph.
 * @param params - Parameters for the search.
 * @param params.from - The source entity ID.
 * @param params.to - The target entity ID.
 * @param params.maxDepth - Maximum path depth (edges) to traverse. Defaults to 6.
 * @param params.minEdgePct - Optional minimum ownership fraction (in [0, 1]) to traverse.
 * @returns An array of all valid control path results found.
 * @throws {@link EntityNotFoundError} if either `from` or `to` does not exist in the graph.
 */
export declare function allControlPaths(graph: GraphManager, params: {
    from: EntityId;
    to: EntityId;
    maxDepth?: number;
    minEdgePct?: number;
}): ControlPathResult[];
//# sourceMappingURL=all-control-paths.d.ts.map