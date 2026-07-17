/**
 * @module graph/graph-manager
 * @description
 * `GraphManager` is the single point of access for the in-memory evidence
 * graph. It wraps a graphology `DirectedGraph`, enforcing VEILBREAKER's
 * domain invariants:
 *
 *   1. Every node is an {@link EntityNode} stored as graphology node attributes.
 *   2. Every edge is an {@link EvidenceEdge} stored as graphology edge attributes.
 *   3. No orphan edges — both endpoints must exist before an edge is added.
 *   4. No duplicate IDs for nodes or edges.
 *
 * This class performs **pure graph operations only**:
 *   - No ownership calculations (those live in `algorithms/`).
 *   - No I/O, no database, no network.
 *   - No LLM or AI.
 *
 * The underlying `DirectedGraph` is never exposed directly. Consumers
 * interact exclusively through the typed public API, which returns
 * domain objects (`EntityNode`, `EvidenceEdge`) rather than raw
 * graphology attribute bags.
 *
 * @example
 * ```ts
 * const gm = new GraphManager();
 *
 * gm.addEntity({ id: 'e1', type: 'company', name: 'Acme', jurisdiction: 'US', attributes: {} });
 * gm.addEntity({ id: 'e2', type: 'person', name: 'Jane', jurisdiction: 'US', attributes: {} });
 *
 * gm.addRelationship({
 *   id: 'r1', from: 'e1', to: 'e2', type: 'director_of',
 *   source_dataset: 'registry', record_id: 'rec-001',
 *   extraction_method: 'registry_filing', reliability_tier: 1,
 * });
 *
 * const neighbors = gm.getNeighbors('e1'); // [{ id: 'e2', ... }]
 * ```
 */
import type { EntityId, EntityNode, EvidenceEdge, EvidenceGraph } from '../types.js';
/**
 * Manages the in-memory evidence graph for a single investigation.
 *
 * Wraps graphology's `DirectedGraph` with typed, domain-safe accessors.
 * All mutating methods throw typed domain errors on constraint violations
 * (duplicates, missing nodes/edges) rather than returning error codes.
 */
export declare class GraphManager {
    /** The underlying graphology directed graph. */
    private readonly graph;
    /**
     * Creates a new `GraphManager` with an empty directed graph.
     *
     * The graph is configured as a simple directed graph — parallel edges
     * between the same pair of nodes are identified by edge key (the
     * `EvidenceEdge.id`), allowing multiple relationships (e.g., `owns_pct`
     * and `director_of`) between the same entity pair.
     */
    constructor();
    /**
     * Adds an entity to the evidence graph.
     *
     * The entity's `id` is used as the graphology node key. Remaining fields
     * are stored as node attributes.
     *
     * @param entity - The entity to add.
     * @throws {@link DuplicateEntityError} if a node with `entity.id` already exists.
     */
    addEntity(entity: EntityNode): void;
    /**
     * Removes an entity and **all edges** connected to it (both incoming and
     * outgoing) from the graph.
     *
     * @param id - The entity ID to remove.
     * @throws {@link EntityNotFoundError} if no node with `id` exists.
     */
    removeEntity(id: EntityId): void;
    /**
     * Retrieves an entity by its ID.
     *
     * @param id - The entity ID to look up.
     * @returns The full `EntityNode`, or `null` if not found.
     */
    getEntity(id: EntityId): EntityNode | null;
    /**
     * Checks whether an entity exists in the graph.
     *
     * @param id - The entity ID to check.
     * @returns `true` if a node with `id` exists.
     */
    hasEntity(id: EntityId): boolean;
    /**
     * Returns the total number of entities in the graph.
     */
    get entityCount(): number;
    /**
     * Returns all entities currently in the graph.
     *
     * @returns An array of `EntityNode` objects (order is not guaranteed).
     */
    getAllEntities(): EntityNode[];
    /**
     * Adds a provenance-stamped relationship (edge) to the evidence graph.
     *
     * Both the source (`from`) and target (`to`) entities must already exist
     * in the graph. The edge `id` must be unique.
     *
     * @param edge - The evidence edge to add.
     * @throws {@link EntityNotFoundError} if `edge.from` or `edge.to` is missing.
     * @throws {@link DuplicateEdgeError} if an edge with `edge.id` already exists.
     */
    addRelationship(edge: EvidenceEdge): void;
    /**
     * Removes a relationship (edge) from the graph by its ID.
     *
     * @param id - The edge ID to remove.
     * @throws {@link EdgeNotFoundError} if no edge with `id` exists.
     */
    removeRelationship(id: string): void;
    /**
     * Retrieves a relationship (edge) by its ID.
     *
     * @param id - The edge ID to look up.
     * @returns The full `EvidenceEdge`, or `null` if not found.
     */
    getRelationship(id: string): EvidenceEdge | null;
    /**
     * Checks whether an edge exists in the graph.
     *
     * @param id - The edge ID to check.
     * @returns `true` if an edge with `id` exists.
     */
    hasRelationship(id: string): boolean;
    /**
     * Returns the total number of edges in the graph.
     */
    get relationshipCount(): number;
    /**
     * Returns all entities directly connected to the given entity
     * (both predecessors and successors — direction agnostic).
     *
     * @param id - The entity ID whose neighbors to retrieve.
     * @returns Array of neighboring `EntityNode` objects.
     * @throws {@link EntityNotFoundError} if no node with `id` exists.
     */
    getNeighbors(id: EntityId): EntityNode[];
    /**
     * Returns all edges pointing **into** the given entity (where `edge.to === id`).
     *
     * @param id - The entity ID to query.
     * @returns Array of incoming `EvidenceEdge` objects.
     * @throws {@link EntityNotFoundError} if no node with `id` exists.
     */
    getIncomingEdges(id: EntityId): EvidenceEdge[];
    /**
     * Returns all edges pointing **out of** the given entity (where `edge.from === id`).
     *
     * @param id - The entity ID to query.
     * @returns Array of outgoing `EvidenceEdge` objects.
     * @throws {@link EntityNotFoundError} if no node with `id` exists.
     */
    getOutgoingEdges(id: EntityId): EvidenceEdge[];
    /**
     * Returns all edges connected to the given entity (both incoming and outgoing).
     *
     * @param id - The entity ID to query.
     * @returns Array of all incident `EvidenceEdge` objects.
     * @throws {@link EntityNotFoundError} if no node with `id` exists.
     */
    getAllEdges(id: EntityId): EvidenceEdge[];
    /**
     * Exports a serialisable snapshot of the current graph state.
     *
     * This is the shape served by the `veilbreaker://graph/evidence` MCP
     * Resource. The returned object is a plain data snapshot — mutations
     * to it do not affect the live graph.
     *
     * @returns An {@link EvidenceGraph} containing all nodes and edges.
     */
    toEvidenceGraph(): EvidenceGraph;
    /**
     * Removes all nodes and edges from the graph, resetting it to an empty state.
     */
    clear(): void;
}
//# sourceMappingURL=graph-manager.d.ts.map