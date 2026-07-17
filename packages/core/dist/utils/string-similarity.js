/**
 * @module string-similarity
 * @description
 * Pure, deterministic string comparison utilities for entity resolution.
 *
 * All functions in this module are:
 *   - **Stateless** — no mutable state, no caches.
 *   - **Deterministic** — same inputs always produce the same output.
 *   - **Side-effect free** — no I/O, no LLM, no network.
 *
 * The Jaro-Winkler implementation follows the original Winkler 1990 paper.
 *
 * @see Winkler, W. E. (1990). "String Comparator Metrics and Enhanced
 *   Decision Rules in the Fellegi-Sunter Model of Record Linkage."
 */
// ─────────────────────────────────────────────────────────────────────────────
// Unicode / Diacritics Map
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Common diacritical-to-ASCII mappings for entity-name normalization.
 * Covers Latin-1 Supplement and Latin Extended-A characters most
 * frequently encountered in corporate-registry data.
 */
const DIACRITICS_MAP = {
    'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
    'Æ': 'AE', 'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
    'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ð': 'D', 'Ñ': 'N',
    'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
    'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ý': 'Y', 'Þ': 'Th',
    'ß': 'ss',
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'æ': 'ae', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ð': 'd', 'ñ': 'n',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'þ': 'th',
    'ÿ': 'y', 'Đ': 'D', 'đ': 'd', 'Ł': 'L', 'ł': 'l',
    'Ő': 'O', 'ő': 'o', 'Ű': 'U', 'ű': 'u',
    'Ş': 'S', 'ş': 's', 'Ț': 'T', 'ț': 't',
    'Ž': 'Z', 'ž': 'z', 'Č': 'C', 'č': 'c', 'Š': 'S', 'š': 's',
};
/**
 * Common legal suffixes that should be stripped during name normalization
 * to avoid false negatives caused by differing corporate-form abbreviations.
 */
const LEGAL_SUFFIXES = [
    /\b(ltd|limited|llc|l\.l\.c|inc|incorporated|corp|corporation)\b/gi,
    /\b(gmbh|ag|sa|s\.a|bv|b\.v|nv|n\.v|plc|p\.l\.c)\b/gi,
    /\b(co|company|pty|proprietary|pvt|private)\b/gi,
];
// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Strips diacritical marks from a string, replacing accented characters
 * with their closest ASCII equivalents.
 *
 * Uses a lookup table for common Latin characters and falls back to
 * Unicode NFD decomposition + combining-mark removal for anything else.
 *
 * @param input - The raw string.
 * @returns The string with diacritics replaced by ASCII equivalents.
 *
 * @example
 * ```ts
 * stripDiacritics('Ségolène Müller') // 'Segolene Muller'
 * ```
 */
export function stripDiacritics(input) {
    let result = '';
    for (const char of input) {
        const mapped = DIACRITICS_MAP[char];
        if (mapped !== undefined) {
            result += mapped;
        }
        else {
            result += char;
        }
    }
    // Fallback: decompose remaining Unicode and strip combining marks
    return result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
/**
 * Normalizes a string for deterministic comparison.
 *
 * The normalization pipeline:
 *   1. Trim leading/trailing whitespace.
 *   2. Convert to lowercase.
 *   3. Strip diacritics (accented → ASCII).
 *   4. Remove all non-alphanumeric characters except spaces.
 *   5. Collapse multiple spaces into one.
 *   6. Trim again (in case stripping left edge spaces).
 *
 * @param input - The raw string to normalize.
 * @returns A lowercase, ASCII-only, single-spaced string.
 *
 * @example
 * ```ts
 * normalizeString('  Méridian  Trading Corp.  ') // 'meridian trading corp'
 * ```
 */
export function normalizeString(input) {
    return stripDiacritics(input.trim().toLowerCase())
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Normalizes an entity name for matching by stripping common legal
 * suffixes (Ltd, LLC, Corp, GmbH, etc.) in addition to the standard
 * normalization pipeline.
 *
 * This prevents false negatives when two records for the same company
 * use different corporate-form abbreviations.
 *
 * @param name - The raw entity name.
 * @returns The normalized name without legal suffixes.
 *
 * @example
 * ```ts
 * normalizeEntityName('Meridian Trading Corp. Ltd.') // 'meridian trading'
 * ```
 */
export function normalizeEntityName(name) {
    let normalized = normalizeString(name);
    for (const suffix of LEGAL_SUFFIXES) {
        normalized = normalized.replace(suffix, '');
    }
    // Collapse any resulting double spaces and trim
    return normalized.replace(/\s+/g, ' ').trim();
}
// ─────────────────────────────────────────────────────────────────────────────
// Jaro Similarity
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Computes the Jaro similarity between two strings.
 *
 * The Jaro similarity is defined as:
 *
 * ```
 * jaro(s1, s2) =
 *   0                                                if m = 0
 *   (1/3) × (m/|s1| + m/|s2| + (m − t) / m)        otherwise
 * ```
 *
 * Where:
 *   - `m` is the number of matching characters.
 *   - `t` is the number of transpositions (halved).
 *   - Two characters are "matching" if they are the same and within
 *     `⌊max(|s1|, |s2|) / 2⌋ − 1` positions of each other.
 *
 * @param s1 - First string (should be pre-normalized).
 * @param s2 - Second string (should be pre-normalized).
 * @returns Similarity in [0, 1]. 1.0 means identical.
 */
export function jaroSimilarity(s1, s2) {
    if (s1 === s2)
        return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0)
        return 0.0;
    // Maximum distance for matching characters
    const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
    const s1Matched = new Array(len1).fill(false);
    const s2Matched = new Array(len2).fill(false);
    let matchCount = 0;
    let transpositions = 0;
    // Pass 1: find matching characters
    for (let i = 0; i < len1; i++) {
        const windowStart = Math.max(0, i - matchWindow);
        const windowEnd = Math.min(i + matchWindow + 1, len2);
        for (let j = windowStart; j < windowEnd; j++) {
            if (s2Matched[j] || s1[i] !== s2[j])
                continue;
            s1Matched[i] = true;
            s2Matched[j] = true;
            matchCount++;
            break;
        }
    }
    if (matchCount === 0)
        return 0.0;
    // Pass 2: count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matched[i])
            continue;
        while (!s2Matched[k])
            k++;
        if (s1[i] !== s2[k])
            transpositions++;
        k++;
    }
    const halfTranspositions = transpositions / 2;
    return ((matchCount / len1 +
        matchCount / len2 +
        (matchCount - halfTranspositions) / matchCount) /
        3);
}
// ─────────────────────────────────────────────────────────────────────────────
// Jaro-Winkler Similarity
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Default Winkler prefix scaling factor.
 * The standard value from the original paper is 0.1.
 */
const WINKLER_PREFIX_SCALE = 0.1;
/**
 * Maximum prefix length considered by Winkler's adjustment.
 * Per the original specification, this is capped at 4.
 */
const MAX_WINKLER_PREFIX = 4;
/**
 * Computes the Jaro-Winkler similarity between two strings.
 *
 * Jaro-Winkler boosts the Jaro score for strings that share a common
 * prefix, reflecting the empirical observation that typos and variations
 * are less likely at the start of a name.
 *
 * ```
 * jw(s1, s2) = jaro + l × p × (1 − jaro)
 * ```
 *
 * Where:
 *   - `l` is the length of the common prefix (max 4).
 *   - `p` is the scaling factor (default 0.1).
 *
 * @param s1 - First string (should be pre-normalized).
 * @param s2 - Second string (should be pre-normalized).
 * @param prefixScale - Winkler scaling factor (default 0.1).
 * @returns Similarity in [0, 1]. 1.0 means identical.
 *
 * @example
 * ```ts
 * jaroWinklerSimilarity('martha', 'marhta')  // ≈ 0.961
 * jaroWinklerSimilarity('dixon', 'dicksonx')  // ≈ 0.813
 * ```
 */
export function jaroWinklerSimilarity(s1, s2, prefixScale = WINKLER_PREFIX_SCALE) {
    const jaro = jaroSimilarity(s1, s2);
    // Compute common prefix length (up to MAX_WINKLER_PREFIX)
    const prefixLimit = Math.min(s1.length, s2.length, MAX_WINKLER_PREFIX);
    let commonPrefix = 0;
    for (let i = 0; i < prefixLimit; i++) {
        if (s1[i] === s2[i]) {
            commonPrefix++;
        }
        else {
            break;
        }
    }
    return jaro + commonPrefix * prefixScale * (1 - jaro);
}
// ─────────────────────────────────────────────────────────────────────────────
// Exact Match Helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Checks whether two strings are an exact match after normalization.
 *
 * @param a - First string (raw).
 * @param b - Second string (raw).
 * @returns `true` if the normalized forms are identical and non-empty.
 */
export function isNormalizedExactMatch(a, b) {
    const normA = normalizeString(a);
    const normB = normalizeString(b);
    return normA.length > 0 && normA === normB;
}
/**
 * Checks whether any identifier in `queryIds` exactly matches any
 * identifier in `candidateIds` after normalization.
 *
 * @param queryIds - Identifiers from the resolution query.
 * @param candidateIds - Identifiers stored on the candidate entity.
 * @returns `true` if at least one pair matches.
 */
export function hasIdentifierOverlap(queryIds, candidateIds) {
    if (queryIds.length === 0 || candidateIds.length === 0)
        return false;
    const normalizedCandidates = new Set(candidateIds.map((id) => normalizeString(id)));
    return queryIds.some((id) => {
        const normalized = normalizeString(id);
        return normalized.length > 0 && normalizedCandidates.has(normalized);
    });
}
//# sourceMappingURL=string-similarity.js.map