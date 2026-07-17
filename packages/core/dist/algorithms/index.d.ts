/**
 * @module algorithms
 * @description Re-exports for the algorithms layer.
 */
export { resolveEntity } from './resolve-entity.js';
export { allControlPaths, type ControlPathResult } from './all-control-paths.js';
export { computeControl, type ComputeControlOutput, type OwnershipBreakdownEntry } from './compute-control.js';
export { scoreEvidence, type ScoreWeights, type ScoreEvidenceResult, DEFAULT_WEIGHTS } from './score-evidence.js';
export { findSharedAttributes, type SharedAttributeLink } from './find-shared-attributes.js';
export { coConsigneeLinks } from './co-consignee-links.js';
export { matchSanctions, type MatchSanctionsOptions } from './match-sanctions.js';
export { assembleDossier } from './assemble-dossier.js';
//# sourceMappingURL=index.d.ts.map