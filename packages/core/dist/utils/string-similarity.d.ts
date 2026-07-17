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
export declare function stripDiacritics(input: string): string;
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
export declare function normalizeString(input: string): string;
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
export declare function normalizeEntityName(name: string): string;
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
export declare function jaroSimilarity(s1: string, s2: string): number;
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
export declare function jaroWinklerSimilarity(s1: string, s2: string, prefixScale?: number): number;
/**
 * Checks whether two strings are an exact match after normalization.
 *
 * @param a - First string (raw).
 * @param b - Second string (raw).
 * @returns `true` if the normalized forms are identical and non-empty.
 */
export declare function isNormalizedExactMatch(a: string, b: string): boolean;
/**
 * Checks whether any identifier in `queryIds` exactly matches any
 * identifier in `candidateIds` after normalization.
 *
 * @param queryIds - Identifiers from the resolution query.
 * @param candidateIds - Identifiers stored on the candidate entity.
 * @returns `true` if at least one pair matches.
 */
export declare function hasIdentifierOverlap(queryIds: readonly string[], candidateIds: readonly string[]): boolean;
//# sourceMappingURL=string-similarity.d.ts.map