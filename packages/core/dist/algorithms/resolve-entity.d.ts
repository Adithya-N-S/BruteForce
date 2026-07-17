/**
 * @module algorithms/resolve-entity
 * @description
 * Deterministic entity resolution — the `resolve_entity` investigative primitive.
 *
 * ## Matching Strategy
 *
 * Entity resolution proceeds in three phases:
 *
 * ### Phase 1 — Blocking (optional fast filter)
 * If the query includes a `jurisdiction`, candidates whose jurisdiction does
 * not match are de-prioritised (not eliminated — they can still match on
 * other fields, just with a lower composite score).
 *
 * ### Phase 2 — Multi-Field Scoring
 * For each candidate entity, field-level similarity scores are computed:
 *
 * | Field          | Method                                     | Weight |
 * |----------------|--------------------------------------------|--------|
 * | **name**       | max(exact=1.0, normalized=0.95, JW)        | 0.45   |
 * | **identifiers**| any exact overlap → 1.0, else 0.0          | 0.30   |
 * | **address**    | max(normalized exact=1.0, JW)              | 0.15   |
 * | **jurisdiction**| exact match → 1.0, else 0.0               | 0.10   |
 *
 * Only fields **present in the query** participate. Weights are re-normalised
 * so they always sum to 1.0, ensuring that providing fewer fields does not
 * penalise candidates unfairly.
 *
 * ### Phase 3 — Thresholding & Classification
 *
 * | Composite Score | Band     | `ambiguous` | Interpretation                   |
 * |-----------------|----------|-------------|----------------------------------|
 * | ≥ 0.85          | `high`   | `false`     | Accept automatically             |
 * | [0.65, 0.85)    | `medium` | `true`      | Gray band — human confirm        |
 * | [0.50, 0.65)    | `low`    | `true`      | Weak — flagged, not actionable   |
 * | < 0.50          | —        | —           | Discarded, not returned          |
 *
 * ### Design Principles
 *
 * - **Deterministic:** Same inputs → same outputs. No randomness, no LLM.
 * - **Pure:** No I/O, no network, no database access.
 * - **Conservative:** Gray-band matches are flagged, never silently accepted.
 * - **Explainable:** Every match includes a human-readable `explanation`
 *   describing exactly which fields matched and how.
 *
 * @see 01_MASTER_CONTEXT.md §14.3 — `resolve_entity` contract
 * @see 03_AGENT_GUIDE.md §3.3 — Graph Database Engineer AI constraints
 */
import type { EntityNode, ResolveEntityInput, ResolveEntityResult } from '../types.js';
/**
 * Deterministically resolves a query against a set of candidate entities.
 *
 * This is a **pure function**: it takes an array of entities and a query,
 * and returns matches. It performs no I/O, no LLM calls, and no database
 * lookups. The graph layer or MCP tool wrapper is responsible for
 * extracting entities from the graph and passing them in.
 *
 * At least one query field must be non-empty or the function returns
 * an empty result (no candidates can be scored).
 *
 * @param entities - The universe of candidate entities to match against.
 * @param query - The resolution query with at least one populated field.
 * @returns Matches above the 0.50 threshold, sorted descending by score.
 *
 * @example
 * ```ts
 * const result = resolveEntity(allEntities, {
 *   name: 'Meridian Trading',
 *   jurisdiction: 'BVI',
 * });
 *
 * for (const match of result.matches) {
 *   console.log(match.entity_id, match.score, match.explanation);
 * }
 * ```
 */
export declare function resolveEntity(entities: readonly EntityNode[], query: ResolveEntityInput): ResolveEntityResult;
//# sourceMappingURL=resolve-entity.d.ts.map