/**
 * @module @veilbreaker/core
 * @description
 * Public API surface of the VEILBREAKER deterministic core.
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
 * import { GraphManager, resolveEntity } from '@veilbreaker/core';
 *
 * const gm = new GraphManager();
 * gm.addEntity({ id: 'e1', type: 'company', name: 'Acme', jurisdiction: 'US', attributes: {} });
 *
 * const result = resolveEntity(gm.getAllEntities(), { name: 'Acme' });
 * ```
 */

// Types — the contract surface (frozen at M1)
export type {
  EntityId,
  EntityType,
  EvidenceEdgeType,
  EvidenceDataset,
  ReliabilityTier,
  ConfidenceBand,
  ExtractionMethod,
  EntityNode,
  EvidenceEdge,
  EvidenceGraph,
  SourceRecord,
  EvidenceConfidence,
  ControlPath,
  ComputeControlResult,
  ResolveEntityInput,
  ResolveEntityMatch,
  ResolveEntityResult,
  SanctionMatch,
  MatchSanctionsResult,
  Dossier,
  AuditEntry,
  AdjudicatorVerdict,
} from './types.js';

// Graph layer
export {
  GraphManager,
  GraphError,
  DuplicateEntityError,
  EntityNotFoundError,
  DuplicateEdgeError,
  EdgeNotFoundError,
} from './graph/index.js';

// Algorithms
export {
  resolveEntity,
  allControlPaths,
  type ControlPathResult,
  computeControl,
  type ComputeControlOutput,
  type OwnershipBreakdownEntry,
  scoreEvidence,
  type ScoreWeights,
  type ScoreEvidenceResult,
  DEFAULT_WEIGHTS,
  findSharedAttributes,
  type SharedAttributeLink,
  coConsigneeLinks,
  assembleDossier,
} from './algorithms/index.js';

// Utilities
export {
  stripDiacritics,
  normalizeString,
  normalizeEntityName,
  jaroSimilarity,
  jaroWinklerSimilarity,
  isNormalizedExactMatch,
  hasIdentifierOverlap,
} from './utils/index.js';
