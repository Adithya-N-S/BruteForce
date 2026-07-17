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

import DirectedGraph from 'graphology';

import type { EntityId, EntityNode, EvidenceEdge, EvidenceGraph } from '../types.js';
import {
  DuplicateEdgeError,
  DuplicateEntityError,
  EdgeNotFoundError,
  EntityNotFoundError,
} from './errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal Attribute Shapes (graphology stores plain objects)
// ─────────────────────────────────────────────────────────────────────────────

/** Attributes stored on each graphology node. Mirrors EntityNode sans `id`. */
type NodeAttributes = Omit<EntityNode, 'id'>;

/** Attributes stored on each graphology edge. Mirrors EvidenceEdge sans `id`, `from`, `to`. */
type EdgeAttributes = Omit<EvidenceEdge, 'id' | 'from' | 'to'>;

// ─────────────────────────────────────────────────────────────────────────────
// GraphManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the in-memory evidence graph for a single investigation.
 *
 * Wraps graphology's `DirectedGraph` with typed, domain-safe accessors.
 * All mutating methods throw typed domain errors on constraint violations
 * (duplicates, missing nodes/edges) rather than returning error codes.
 */
export class GraphManager {
  /** The underlying graphology directed graph. */
  private readonly graph: DirectedGraph<NodeAttributes, EdgeAttributes>;

  /**
   * Creates a new `GraphManager` with an empty directed graph.
   *
   * The graph is configured as a simple directed graph — parallel edges
   * between the same pair of nodes are identified by edge key (the
   * `EvidenceEdge.id`), allowing multiple relationships (e.g., `owns_pct`
   * and `director_of`) between the same entity pair.
   */
  constructor() {
    this.graph = new DirectedGraph<NodeAttributes, EdgeAttributes>({
      allowSelfLoops: false,
      multi: true,
    });
  }

  // ───────────────────────── Node Operations ─────────────────────────────

  /**
   * Adds an entity to the evidence graph.
   *
   * The entity's `id` is used as the graphology node key. Remaining fields
   * are stored as node attributes.
   *
   * @param entity - The entity to add.
   * @throws {@link DuplicateEntityError} if a node with `entity.id` already exists.
   */
  public addEntity(entity: EntityNode): void {
    if (this.graph.hasNode(entity.id)) {
      throw new DuplicateEntityError(entity.id);
    }

    const { id: _id, ...attributes } = entity;
    this.graph.addNode(entity.id, attributes);
  }

  /**
   * Removes an entity and **all edges** connected to it (both incoming and
   * outgoing) from the graph.
   *
   * @param id - The entity ID to remove.
   * @throws {@link EntityNotFoundError} if no node with `id` exists.
   */
  public removeEntity(id: EntityId): void {
    if (!this.graph.hasNode(id)) {
      throw new EntityNotFoundError(id);
    }

    // graphology's dropNode also drops all incident edges
    this.graph.dropNode(id);
  }

  /**
   * Retrieves an entity by its ID.
   *
   * @param id - The entity ID to look up.
   * @returns The full `EntityNode`, or `null` if not found.
   */
  public getEntity(id: EntityId): EntityNode | null {
    if (!this.graph.hasNode(id)) {
      return null;
    }

    const attrs = this.graph.getNodeAttributes(id);
    return { id, ...attrs };
  }

  /**
   * Checks whether an entity exists in the graph.
   *
   * @param id - The entity ID to check.
   * @returns `true` if a node with `id` exists.
   */
  public hasEntity(id: EntityId): boolean {
    return this.graph.hasNode(id);
  }

  /**
   * Returns the total number of entities in the graph.
   */
  public get entityCount(): number {
    return this.graph.order;
  }

  /**
   * Returns all entities currently in the graph.
   *
   * @returns An array of `EntityNode` objects (order is not guaranteed).
   */
  public getAllEntities(): EntityNode[] {
    return this.graph.mapNodes((id, attrs) => ({ id, ...attrs }));
  }

  // ───────────────────────── Edge Operations ─────────────────────────────

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
  public addRelationship(edge: EvidenceEdge): void {
    if (!this.graph.hasNode(edge.from)) {
      throw new EntityNotFoundError(edge.from);
    }
    if (!this.graph.hasNode(edge.to)) {
      throw new EntityNotFoundError(edge.to);
    }
    if (this.graph.hasEdge(edge.id)) {
      throw new DuplicateEdgeError(edge.id);
    }

    const { id: _id, from: _from, to: _to, ...attributes } = edge;
    this.graph.addEdgeWithKey(edge.id, edge.from, edge.to, attributes);
  }

  /**
   * Removes a relationship (edge) from the graph by its ID.
   *
   * @param id - The edge ID to remove.
   * @throws {@link EdgeNotFoundError} if no edge with `id` exists.
   */
  public removeRelationship(id: string): void {
    if (!this.graph.hasEdge(id)) {
      throw new EdgeNotFoundError(id);
    }

    this.graph.dropEdge(id);
  }

  /**
   * Retrieves a relationship (edge) by its ID.
   *
   * @param id - The edge ID to look up.
   * @returns The full `EvidenceEdge`, or `null` if not found.
   */
  public getRelationship(id: string): EvidenceEdge | null {
    if (!this.graph.hasEdge(id)) {
      return null;
    }

    const attrs = this.graph.getEdgeAttributes(id);
    const from = this.graph.source(id);
    const to = this.graph.target(id);

    return { id, from, to, ...attrs };
  }

  /**
   * Checks whether an edge exists in the graph.
   *
   * @param id - The edge ID to check.
   * @returns `true` if an edge with `id` exists.
   */
  public hasRelationship(id: string): boolean {
    return this.graph.hasEdge(id);
  }

  /**
   * Returns the total number of edges in the graph.
   */
  public get relationshipCount(): number {
    return this.graph.size;
  }

  // ───────────────────────── Traversal ────────────────────────────────────

  /**
   * Returns all entities directly connected to the given entity
   * (both predecessors and successors — direction agnostic).
   *
   * @param id - The entity ID whose neighbors to retrieve.
   * @returns Array of neighboring `EntityNode` objects.
   * @throws {@link EntityNotFoundError} if no node with `id` exists.
   */
  public getNeighbors(id: EntityId): EntityNode[] {
    if (!this.graph.hasNode(id)) {
      throw new EntityNotFoundError(id);
    }

    return this.graph.mapNeighbors(id, (neighborId, attrs) => ({
      id: neighborId,
      ...attrs,
    }));
  }

  /**
   * Returns all edges pointing **into** the given entity (where `edge.to === id`).
   *
   * @param id - The entity ID to query.
   * @returns Array of incoming `EvidenceEdge` objects.
   * @throws {@link EntityNotFoundError} if no node with `id` exists.
   */
  public getIncomingEdges(id: EntityId): EvidenceEdge[] {
    if (!this.graph.hasNode(id)) {
      throw new EntityNotFoundError(id);
    }

    return this.graph.mapInEdges(id, (edgeId, attrs, source, target) => ({
      id: edgeId,
      from: source,
      to: target,
      ...attrs,
    }));
  }

  /**
   * Returns all edges pointing **out of** the given entity (where `edge.from === id`).
   *
   * @param id - The entity ID to query.
   * @returns Array of outgoing `EvidenceEdge` objects.
   * @throws {@link EntityNotFoundError} if no node with `id` exists.
   */
  public getOutgoingEdges(id: EntityId): EvidenceEdge[] {
    if (!this.graph.hasNode(id)) {
      throw new EntityNotFoundError(id);
    }

    return this.graph.mapOutEdges(id, (edgeId, attrs, source, target) => ({
      id: edgeId,
      from: source,
      to: target,
      ...attrs,
    }));
  }

  /**
   * Returns all edges connected to the given entity (both incoming and outgoing).
   *
   * @param id - The entity ID to query.
   * @returns Array of all incident `EvidenceEdge` objects.
   * @throws {@link EntityNotFoundError} if no node with `id` exists.
   */
  public getAllEdges(id: EntityId): EvidenceEdge[] {
    if (!this.graph.hasNode(id)) {
      throw new EntityNotFoundError(id);
    }

    return this.graph.mapEdges(id, (edgeId, attrs, source, target) => ({
      id: edgeId,
      from: source,
      to: target,
      ...attrs,
    }));
  }

  // ───────────────────────── Snapshot / Export ────────────────────────────

  /**
   * Exports a serialisable snapshot of the current graph state.
   *
   * This is the shape served by the `veilbreaker://graph/evidence` MCP
   * Resource. The returned object is a plain data snapshot — mutations
   * to it do not affect the live graph.
   *
   * @returns An {@link EvidenceGraph} containing all nodes and edges.
   */
  public toEvidenceGraph(): EvidenceGraph {
    const nodes = this.getAllEntities();

    const edges: EvidenceEdge[] = this.graph.mapEdges(
      (edgeId, attrs, source, target) => ({
        id: edgeId,
        from: source,
        to: target,
        ...attrs,
      }),
    );

    return { nodes, edges };
  }

  /**
   * Removes all nodes and edges from the graph, resetting it to an empty state.
   */
  public clear(): void {
    this.graph.clear();
  }
}
