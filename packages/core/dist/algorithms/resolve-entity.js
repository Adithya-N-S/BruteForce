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
import { hasIdentifierOverlap, isNormalizedExactMatch, jaroWinklerSimilarity, normalizeEntityName, normalizeString, } from '../utils/string-similarity.js';
// ─────────────────────────────────────────────────────────────────────────────
// Configuration Constants
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Minimum composite score to include a candidate in the result set.
 * Candidates below this threshold are silently discarded.
 */
const MIN_SCORE_THRESHOLD = 0.50;
/** Score at or above which a match is classified as high-confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
/** Score at or above which a match enters the gray band (medium confidence). */
const MEDIUM_CONFIDENCE_THRESHOLD = 0.65;
/**
 * Field weights used in composite-score computation.
 * These are the *default* weights; they are re-normalised at runtime
 * based on which query fields are actually provided.
 */
const FIELD_WEIGHTS = {
    name: 0.45,
    identifiers: 0.30,
    address: 0.15,
    jurisdiction: 0.10,
};
/** Score awarded for an exact match on the raw (original-casing) name. */
const EXACT_NAME_SCORE = 1.0;
/** Score awarded for an exact match on the normalized (lower+stripped) name. */
const NORMALIZED_NAME_SCORE = 0.95;
/**
 * Computes the name similarity between a query name and a candidate entity name.
 *
 * Scoring precedence:
 *   1. Exact raw-string match → 1.0
 *   2. Exact normalized match (case/diacritics/punctuation insensitive) → 0.95
 *   3. Jaro-Winkler on normalized entity names (legal suffixes stripped) → JW score
 *
 * The highest applicable score is returned.
 *
 * @param queryName - The name from the resolution query.
 * @param candidateName - The name stored on the candidate entity.
 * @returns The field score with an explanation feature tag.
 */
function scoreNameField(queryName, candidateName) {
    // 1. Exact raw match
    if (queryName === candidateName) {
        return {
            field: 'name',
            score: EXACT_NAME_SCORE,
            feature: 'name:exact',
        };
    }
    // 2. Normalized exact match
    if (isNormalizedExactMatch(queryName, candidateName)) {
        return {
            field: 'name',
            score: NORMALIZED_NAME_SCORE,
            feature: 'name:normalized_exact',
        };
    }
    // 3. Jaro-Winkler on entity-name-normalized strings
    const normQuery = normalizeEntityName(queryName);
    const normCandidate = normalizeEntityName(candidateName);
    if (normQuery.length === 0 || normCandidate.length === 0) {
        return { field: 'name', score: 0, feature: null };
    }
    const jw = jaroWinklerSimilarity(normQuery, normCandidate);
    const roundedJw = Math.round(jw * 100) / 100;
    return {
        field: 'name',
        score: jw,
        feature: jw > 0 ? `name:jaro=${roundedJw.toFixed(2)}` : null,
    };
}
/**
 * Computes the identifier similarity between query identifiers and
 * candidate entity identifiers.
 *
 * This is a binary signal: if any query identifier exactly matches any
 * candidate identifier (after normalization), the score is 1.0; otherwise 0.0.
 *
 * Candidate identifiers are extracted from `entity.attributes` under the
 * keys `registration_number`, `tax_id`, `identifiers`, and any key ending
 * with `_number` or `_id`.
 *
 * @param queryIds - Identifiers from the resolution query.
 * @param entity - The candidate entity.
 * @returns The field score.
 */
function scoreIdentifierField(queryIds, entity) {
    const candidateIds = extractIdentifiers(entity);
    if (candidateIds.length === 0 || queryIds.length === 0) {
        return { field: 'identifiers', score: 0, feature: null };
    }
    if (hasIdentifierOverlap(queryIds, candidateIds)) {
        return {
            field: 'identifiers',
            score: 1.0,
            feature: 'identifiers:exact_match',
        };
    }
    return { field: 'identifiers', score: 0, feature: null };
}
/**
 * Extracts all identifier-like values from an entity's attributes.
 *
 * Recognized attribute keys:
 * - `registration_number`
 * - `tax_id`
 * - `identifiers` (if array of strings)
 * - Any key matching the pattern `*_number` or `*_id`
 *
 * @param entity - The entity to extract identifiers from.
 * @returns A flat array of identifier strings.
 */
function extractIdentifiers(entity) {
    const ids = [];
    const attrs = entity.attributes;
    for (const [key, value] of Object.entries(attrs)) {
        const isIdKey = key === 'registration_number' ||
            key === 'tax_id' ||
            key === 'identifiers' ||
            key.endsWith('_number') ||
            key.endsWith('_id');
        if (!isIdKey)
            continue;
        if (typeof value === 'string' && value.length > 0) {
            ids.push(value);
        }
        else if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === 'string' && item.length > 0) {
                    ids.push(item);
                }
            }
        }
    }
    return ids;
}
/**
 * Computes address similarity between a query address and a candidate entity.
 *
 * Uses the same tiered approach as name scoring:
 *   1. Normalized exact match → 1.0
 *   2. Jaro-Winkler on normalized strings → JW score
 *
 * Candidate address is extracted from `entity.attributes.address` if present,
 * or from the entity name if the entity type is `'address'`.
 *
 * @param queryAddress - The address from the resolution query.
 * @param entity - The candidate entity.
 * @returns The field score.
 */
function scoreAddressField(queryAddress, entity) {
    const candidateAddress = extractAddress(entity);
    if (!candidateAddress || candidateAddress.length === 0) {
        return { field: 'address', score: 0, feature: null };
    }
    // 1. Normalized exact match
    if (isNormalizedExactMatch(queryAddress, candidateAddress)) {
        return {
            field: 'address',
            score: 1.0,
            feature: 'address:exact',
        };
    }
    // 2. Jaro-Winkler
    const normQuery = normalizeString(queryAddress);
    const normCandidate = normalizeString(candidateAddress);
    if (normQuery.length === 0 || normCandidate.length === 0) {
        return { field: 'address', score: 0, feature: null };
    }
    const jw = jaroWinklerSimilarity(normQuery, normCandidate);
    const roundedJw = Math.round(jw * 100) / 100;
    return {
        field: 'address',
        score: jw,
        feature: jw > 0 ? `address:jaro=${roundedJw.toFixed(2)}` : null,
    };
}
/**
 * Extracts an address string from an entity, checking:
 *   1. `entity.attributes.address` (string)
 *   2. `entity.name` if entity type is `'address'`
 *
 * @param entity - The entity to extract an address from.
 * @returns The address string, or `null` if none found.
 */
function extractAddress(entity) {
    const addrAttr = entity.attributes['address'];
    if (typeof addrAttr === 'string' && addrAttr.length > 0) {
        return addrAttr;
    }
    if (entity.type === 'address') {
        return entity.name;
    }
    return null;
}
/**
 * Computes jurisdiction similarity between a query jurisdiction and
 * a candidate entity's jurisdiction.
 *
 * This is a binary exact-match signal after normalization.
 *
 * @param queryJurisdiction - The jurisdiction from the resolution query.
 * @param candidateJurisdiction - The jurisdiction stored on the candidate.
 * @returns The field score.
 */
function scoreJurisdictionField(queryJurisdiction, candidateJurisdiction) {
    if (normalizeString(queryJurisdiction).length > 0 &&
        isNormalizedExactMatch(queryJurisdiction, candidateJurisdiction)) {
        return {
            field: 'jurisdiction',
            score: 1.0,
            feature: 'jurisdiction:exact',
        };
    }
    return { field: 'jurisdiction', score: 0, feature: null };
}
/**
 * Maps a numeric score to a confidence band.
 *
 * @param score - Composite similarity score in [0, 1].
 * @returns The categorical confidence band.
 */
function classifyConfidence(score) {
    if (score >= HIGH_CONFIDENCE_THRESHOLD)
        return 'high';
    if (score >= MEDIUM_CONFIDENCE_THRESHOLD)
        return 'medium';
    return 'low';
}
/**
 * Determines whether a match at the given score should be flagged as ambiguous.
 *
 * Matches with score ≥ 0.85 are considered unambiguous (high confidence).
 * All other matches above the minimum threshold are ambiguous.
 *
 * @param score - Composite similarity score.
 * @returns `true` if the match is in the gray band or below.
 */
function isAmbiguous(score) {
    return score < HIGH_CONFIDENCE_THRESHOLD;
}
/**
 * Builds a human-readable explanation string from the field scores
 * and the composite result.
 *
 * @param entityName - The name of the matched entity.
 * @param fieldScores - The per-field scoring results.
 * @param compositeScore - The weighted aggregate score.
 * @returns A deterministic, readable explanation.
 */
function buildExplanation(entityName, fieldScores, compositeScore) {
    const parts = [];
    for (const fs of fieldScores) {
        if (fs.feature === null)
            continue;
        switch (fs.field) {
            case 'name':
                if (fs.feature === 'name:exact') {
                    parts.push(`exact name match on '${entityName}'`);
                }
                else if (fs.feature === 'name:normalized_exact') {
                    parts.push(`normalized exact name match on '${entityName}'`);
                }
                else {
                    parts.push(`Jaro-Winkler name similarity ${fs.score.toFixed(2)} on '${entityName}'`);
                }
                break;
            case 'identifiers':
                parts.push('exact identifier match');
                break;
            case 'address':
                if (fs.feature === 'address:exact') {
                    parts.push('exact address match');
                }
                else {
                    parts.push(`Jaro-Winkler address similarity ${fs.score.toFixed(2)}`);
                }
                break;
            case 'jurisdiction':
                parts.push('exact jurisdiction match');
                break;
        }
    }
    const rounded = Math.round(compositeScore * 100) / 100;
    if (parts.length === 0) {
        return `Weak composite match (score: ${rounded.toFixed(2)}).`;
    }
    return `Matched via ${parts.join(', ')}. Composite score: ${rounded.toFixed(2)}.`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
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
export function resolveEntity(entities, query) {
    // Guard: if no query fields are provided, no matching is possible.
    const hasName = query.name !== undefined && query.name.trim().length > 0;
    const hasAddress = query.address !== undefined && query.address.trim().length > 0;
    const hasIdentifiers = query.identifiers !== undefined && query.identifiers.length > 0;
    const hasJurisdiction = query.jurisdiction !== undefined && query.jurisdiction.trim().length > 0;
    if (!hasName && !hasAddress && !hasIdentifiers && !hasJurisdiction) {
        return { matches: [] };
    }
    // Compute the active field weights (only fields present in the query).
    const activeWeights = {};
    if (hasName)
        activeWeights.name = FIELD_WEIGHTS.name;
    if (hasIdentifiers)
        activeWeights.identifiers = FIELD_WEIGHTS.identifiers;
    if (hasAddress)
        activeWeights.address = FIELD_WEIGHTS.address;
    if (hasJurisdiction)
        activeWeights.jurisdiction = FIELD_WEIGHTS.jurisdiction;
    // Re-normalize so active weights sum to 1.0
    const weightSum = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    const normalizedWeights = {};
    for (const [key, value] of Object.entries(activeWeights)) {
        normalizedWeights[key] = value / weightSum;
    }
    // Score each candidate
    const matches = [];
    for (const entity of entities) {
        const fieldScores = [];
        // Name
        if (hasName) {
            fieldScores.push(scoreNameField(query.name, entity.name));
        }
        // Identifiers
        if (hasIdentifiers) {
            fieldScores.push(scoreIdentifierField(query.identifiers, entity));
        }
        // Address
        if (hasAddress) {
            fieldScores.push(scoreAddressField(query.address, entity));
        }
        // Jurisdiction
        if (hasJurisdiction) {
            fieldScores.push(scoreJurisdictionField(query.jurisdiction, entity.jurisdiction));
        }
        // Compute weighted composite score
        let compositeScore = 0;
        for (const fs of fieldScores) {
            const weight = normalizedWeights[fs.field] ?? 0;
            compositeScore += fs.score * weight;
        }
        // Apply threshold
        if (compositeScore < MIN_SCORE_THRESHOLD)
            continue;
        // Collect matched features (non-null features only)
        const matched_features = fieldScores
            .filter((fs) => fs.feature !== null)
            .map((fs) => fs.feature);
        const confidence = classifyConfidence(compositeScore);
        matches.push({
            entity_id: entity.id,
            score: Math.round(compositeScore * 10000) / 10000, // 4 decimal precision
            matched_features,
            ambiguous: isAmbiguous(compositeScore),
            confidence,
            explanation: buildExplanation(entity.name, fieldScores, compositeScore),
        });
    }
    // Sort descending by score, then alphabetically by entity_id for stability
    matches.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return a.entity_id.localeCompare(b.entity_id);
    });
    return { matches };
}
//# sourceMappingURL=resolve-entity.js.map