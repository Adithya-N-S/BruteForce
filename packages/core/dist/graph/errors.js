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
export class GraphError extends Error {
    /** Machine-readable error code. */
    code;
    constructor(code, message) {
        super(message);
        this.name = 'GraphError';
        this.code = code;
        // Restore prototype chain for instanceof checks under TS compilation
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
/**
 * Thrown when attempting to add a node whose `id` already exists in the graph.
 */
export class DuplicateEntityError extends GraphError {
    /** The ID that collided. */
    entityId;
    constructor(entityId) {
        super('DUPLICATE_ENTITY', `Entity '${entityId}' already exists in the graph.`);
        this.name = 'DuplicateEntityError';
        this.entityId = entityId;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
/**
 * Thrown when a referenced entity ID does not exist in the graph.
 */
export class EntityNotFoundError extends GraphError {
    /** The ID that was not found. */
    entityId;
    constructor(entityId) {
        super('ENTITY_NOT_FOUND', `Entity '${entityId}' not found in the graph.`);
        this.name = 'EntityNotFoundError';
        this.entityId = entityId;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
/**
 * Thrown when attempting to add an edge whose `id` already exists in the graph.
 */
export class DuplicateEdgeError extends GraphError {
    /** The edge ID that collided. */
    edgeId;
    constructor(edgeId) {
        super('DUPLICATE_EDGE', `Edge '${edgeId}' already exists in the graph.`);
        this.name = 'DuplicateEdgeError';
        this.edgeId = edgeId;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
/**
 * Thrown when a referenced edge ID does not exist in the graph.
 */
export class EdgeNotFoundError extends GraphError {
    /** The edge ID that was not found. */
    edgeId;
    constructor(edgeId) {
        super('EDGE_NOT_FOUND', `Edge '${edgeId}' not found in the graph.`);
        this.name = 'EdgeNotFoundError';
        this.edgeId = edgeId;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
//# sourceMappingURL=errors.js.map