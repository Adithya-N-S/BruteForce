/**
 * @module @bruteforce/core
 * @description
 * Public API surface of the BruteForce deterministic core.
 *
 * This package contains **only** pure, deterministic logic:
 *   - Typed domain model (`types`)
 *   - In-memory evidence graph (`graph`)
 *   - Investigative algorithms (`algorithms`)
 *   - String utilities (`utils`)
 *
 * It has **no** I/O, **no** LLM dependency, and **no** database connection.
 *
 * @example
 * ```ts
 * import { GraphManager, resolveEntity } from '@bruteforce/core';
 *
 * const gm = new GraphManager();
 * gm.addEntity({ id: 'e1', type: 'company', name: 'Acme', jurisdiction: 'US', attributes: {} });
 *
 * const result = resolveEntity(gm.getAllEntities(), { name: 'Acme' });
 * ```
 */
// Graph layer
export { GraphManager, GraphError, DuplicateEntityError, EntityNotFoundError, DuplicateEdgeError, EdgeNotFoundError, } from './graph/index.js';
// Algorithms
export { resolveEntity, allControlPaths, computeControl, scoreEvidence, DEFAULT_WEIGHTS, findSharedAttributes, coConsigneeLinks, assembleDossier, matchSanctions, } from './algorithms/index.js';
// Utilities
export { stripDiacritics, normalizeString, normalizeEntityName, jaroSimilarity, jaroWinklerSimilarity, isNormalizedExactMatch, hasIdentifierOverlap, } from './utils/index.js';
//# sourceMappingURL=index.js.map