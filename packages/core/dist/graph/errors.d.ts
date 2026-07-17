/**
 * @module graph/errors
 * @description
 * Typed domain errors for graph operations. Each error carries structured
 * context so callers can handle failures precisely without parsing messages.
 *
 * All errors extend a common `GraphError` base class so consumers can
 * `catch (e) { if (e instanceof GraphError) { ... } }` at layer boundaries.
 */
/**
 * Base class for all errors originating from the graph layer.
 * Carries an error `code` for programmatic discrimination.
 */
export declare class GraphError extends Error {
    /** Machine-readable error code. */
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Thrown when attempting to add a node whose `id` already exists in the graph.
 */
export declare class DuplicateEntityError extends GraphError {
    /** The ID that collided. */
    readonly entityId: string;
    constructor(entityId: string);
}
/**
 * Thrown when a referenced entity ID does not exist in the graph.
 */
export declare class EntityNotFoundError extends GraphError {
    /** The ID that was not found. */
    readonly entityId: string;
    constructor(entityId: string);
}
/**
 * Thrown when attempting to add an edge whose `id` already exists in the graph.
 */
export declare class DuplicateEdgeError extends GraphError {
    /** The edge ID that collided. */
    readonly edgeId: string;
    constructor(edgeId: string);
}
/**
 * Thrown when a referenced edge ID does not exist in the graph.
 */
export declare class EdgeNotFoundError extends GraphError {
    /** The edge ID that was not found. */
    readonly edgeId: string;
    constructor(edgeId: string);
}
//# sourceMappingURL=errors.d.ts.map