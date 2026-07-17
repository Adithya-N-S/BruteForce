/**
 * Unit tests for string-similarity utilities.
 *
 * Covers:
 *   - Diacritics stripping
 *   - String normalization
 *   - Entity-name normalization (legal suffix removal)
 *   - Jaro similarity
 *   - Jaro-Winkler similarity
 *   - Exact match helpers
 *   - Identifier overlap detection
 */
import { describe, expect, it } from 'vitest';

import {
  hasIdentifierOverlap,
  isNormalizedExactMatch,
  jaroSimilarity,
  jaroWinklerSimilarity,
  normalizeEntityName,
  normalizeString,
  stripDiacritics,
} from '../src/utils/string-similarity.js';

// ─────────────────────────────────────────────────────────────────────────────
// stripDiacritics
// ─────────────────────────────────────────────────────────────────────────────

describe('stripDiacritics', () => {
  it('returns ASCII-only output for common Latin accented characters', () => {
    expect(stripDiacritics('Ségolène')).toBe('Segolene');
    expect(stripDiacritics('Müller')).toBe('Muller');
    expect(stripDiacritics('Čović')).toBe('Covic');
    expect(stripDiacritics('Łódź')).toBe('Lodz');
    expect(stripDiacritics('Þórr')).toBe('Thorr');
  });

  it('returns plain ASCII strings unchanged', () => {
    expect(stripDiacritics('Hello World')).toBe('Hello World');
    expect(stripDiacritics('')).toBe('');
  });

  it('handles Æ/æ ligatures', () => {
    expect(stripDiacritics('Ælfred')).toBe('AElfred');
    expect(stripDiacritics('cæsar')).toBe('caesar');
  });

  it('handles ß (sharp s)', () => {
    expect(stripDiacritics('Straße')).toBe('Strasse');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeString
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeString', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeString('  Hello   World  ')).toBe('hello world');
  });

  it('strips diacritics and non-alphanumeric characters', () => {
    expect(normalizeString('Méridian Trading Corp.')).toBe('meridian trading corp');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalizeString('')).toBe('');
    expect(normalizeString('   ')).toBe('');
  });

  it('preserves numbers', () => {
    expect(normalizeString('Suite 42, Floor 3')).toBe('suite 42 floor 3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeEntityName
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeEntityName', () => {
  it('strips common English legal suffixes', () => {
    expect(normalizeEntityName('Meridian Trading Corp.')).toBe('meridian trading');
    expect(normalizeEntityName('Acme Holdings Ltd')).toBe('acme holdings');
    expect(normalizeEntityName('FooBar LLC')).toBe('foobar');
    expect(normalizeEntityName('Global Inc.')).toBe('global');
    expect(normalizeEntityName('TechCo Incorporated')).toBe('techco');
  });

  it('strips European legal suffixes', () => {
    expect(normalizeEntityName('Siemens AG')).toBe('siemens');
    expect(normalizeEntityName('Deutsche GmbH')).toBe('deutsche');
    expect(normalizeEntityName('Shell B.V.')).toBe('shell');
    expect(normalizeEntityName('Total S.A.')).toBe('total');
  });

  it('handles mixed suffixes and diacritics', () => {
    expect(normalizeEntityName('Société Générale S.A.')).toBe('societe generale');
  });

  it('leaves names without legal suffixes unchanged (post-normalization)', () => {
    expect(normalizeEntityName('Meridian Trading')).toBe('meridian trading');
  });

  it('handles empty input', () => {
    expect(normalizeEntityName('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jaroSimilarity
// ─────────────────────────────────────────────────────────────────────────────

describe('jaroSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroSimilarity('abc', 'abc')).toBe(1.0);
    expect(jaroSimilarity('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty and the other is not', () => {
    expect(jaroSimilarity('', 'abc')).toBe(0.0);
    expect(jaroSimilarity('abc', '')).toBe(0.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaroSimilarity('abc', 'xyz')).toBe(0.0);
  });

  it('computes known Jaro values correctly', () => {
    // Classic example: MARTHA / MARHTA
    const jaro = jaroSimilarity('martha', 'marhta');
    expect(jaro).toBeCloseTo(0.9444, 3);
  });

  it('is symmetric', () => {
    const ab = jaroSimilarity('kitten', 'sitting');
    const ba = jaroSimilarity('sitting', 'kitten');
    expect(ab).toBeCloseTo(ba, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jaroWinklerSimilarity
// ─────────────────────────────────────────────────────────────────────────────

describe('jaroWinklerSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinklerSimilarity('test', 'test')).toBe(1.0);
  });

  it('boosts score for common prefixes', () => {
    const jaro = jaroSimilarity('martha', 'marhta');
    const jw = jaroWinklerSimilarity('martha', 'marhta');
    expect(jw).toBeGreaterThan(jaro);
    expect(jw).toBeCloseTo(0.9611, 3);
  });

  it('computes DIXON / DICKSONX correctly', () => {
    const jw = jaroWinklerSimilarity('dixon', 'dicksonx');
    expect(jw).toBeCloseTo(0.8133, 3);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(jaroWinklerSimilarity('', 'test')).toBe(0.0);
    expect(jaroWinklerSimilarity('test', '')).toBe(0.0);
  });

  it('handles single-character strings', () => {
    expect(jaroWinklerSimilarity('a', 'a')).toBe(1.0);
    expect(jaroWinklerSimilarity('a', 'b')).toBe(0.0);
  });

  it('caps prefix length at 4', () => {
    // "abcde" and "abcdf" share a 4-char prefix (capped)
    const jw1 = jaroWinklerSimilarity('abcde', 'abcdf');
    // "abcdef" and "abcdeg" also share a 4-char prefix (same cap)
    const jw2 = jaroWinklerSimilarity('abcdef', 'abcdeg');
    // Both should have significant Winkler boost
    expect(jw1).toBeGreaterThan(0.9);
    expect(jw2).toBeGreaterThan(0.9);
  });

  it('is deterministic across repeated calls', () => {
    const s1 = 'meridian trading';
    const s2 = 'meridian traders';
    const result1 = jaroWinklerSimilarity(s1, s2);
    const result2 = jaroWinklerSimilarity(s1, s2);
    expect(result1).toBe(result2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isNormalizedExactMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('isNormalizedExactMatch', () => {
  it('returns true for case-insensitive matches', () => {
    expect(isNormalizedExactMatch('Hello', 'hello')).toBe(true);
  });

  it('returns true when diacritics differ', () => {
    expect(isNormalizedExactMatch('Müller', 'muller')).toBe(true);
  });

  it('returns true when punctuation differs', () => {
    expect(isNormalizedExactMatch('Hello, World!', 'hello world')).toBe(true);
  });

  it('returns false for genuinely different strings', () => {
    expect(isNormalizedExactMatch('Alice', 'Bob')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isNormalizedExactMatch('', '')).toBe(false);
    expect(isNormalizedExactMatch('', 'hello')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasIdentifierOverlap
// ─────────────────────────────────────────────────────────────────────────────

describe('hasIdentifierOverlap', () => {
  it('detects exact overlap after normalization', () => {
    expect(hasIdentifierOverlap(['BVI-29481'], ['bvi-29481', 'OTHER'])).toBe(true);
  });

  it('detects overlap among multiple identifiers', () => {
    expect(hasIdentifierOverlap(['A', 'B', 'C'], ['X', 'Y', 'B'])).toBe(true);
  });

  it('returns false when no overlap exists', () => {
    expect(hasIdentifierOverlap(['A'], ['B'])).toBe(false);
  });

  it('returns false for empty arrays', () => {
    expect(hasIdentifierOverlap([], ['A'])).toBe(false);
    expect(hasIdentifierOverlap(['A'], [])).toBe(false);
    expect(hasIdentifierOverlap([], [])).toBe(false);
  });

  it('ignores empty-string identifiers', () => {
    expect(hasIdentifierOverlap([''], [''])).toBe(false);
  });
});
