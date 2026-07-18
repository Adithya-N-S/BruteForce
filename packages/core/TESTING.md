# Core Package Testing Guide

## Overview

The `@bruteforce/core` test suite validates every layer of the VEILBREAKER deterministic evidence-graph engine — from low-level string utilities and the in-memory graph manager up through the six investigative algorithms and the final dossier-assembly pipeline.

All algorithms in this package are **pure functions** with no I/O, no LLM dependency, and no database access. The test suite enforces correctness, determinism, and robustness against adversarial or degenerate inputs.

**Current status:** 225 tests across 7 test files — all passing.

---

## Test Framework

| Tool | Version | Purpose |
|------|---------|---------|
| [Vitest](https://vitest.dev/) | `^2.0.0` | Test runner and assertion library |
| V8 Coverage | built-in | Code coverage via `vitest --coverage` |

**Why Vitest?**

- Native ESM support — the core package uses `"type": "module"` and ES2022 targets.
- First-class TypeScript integration — no separate `ts-jest` configuration required.
- Fast execution — all 225 tests complete in ~1 second.
- Compatible with the `vitest run` (CI-friendly one-shot) and `vitest` (interactive watch) modes.

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|-----------------|
| Node.js | `>= 20.0.0` |
| npm | `>= 9.0.0` (ships with Node 20) |

### Install dependencies

From the **workspace root** (monorepo):

```bash
npm install
```

Or from `packages/core` directly (if working in isolation):

```bash
cd packages/core
npm install
```

---

## Building the Package

The core package must compile cleanly before tests can run against the built output (though Vitest transpiles on-the-fly for tests).

```bash
# From packages/core
npm run build
```

This runs `tsc` and emits JavaScript + declaration files to `dist/`.

To type-check without emitting files:

```bash
npm run typecheck
```

To remove previous build artifacts:

```bash
npm run clean
```

---

## Running Tests

### Run all tests (one-shot, CI-friendly)

```bash
cd packages/core
npm test
```

This executes `vitest run`, which runs every test file once and exits with a non-zero code on failure.

### Run a single test file

```bash
npx vitest run tests/compute-control.test.ts
```

### Run tests in watch mode (interactive development)

```bash
npm run test:watch
```

This launches Vitest in interactive mode. It re-runs affected tests automatically when source or test files change.

### Run tests with coverage

```bash
npx vitest run --coverage
```

Coverage is configured to use the V8 provider and covers all files under `src/**/*.ts` (excluding barrel `index.ts` re-exports).

---

## Test Suite

The test suite is organized into **7 test files** totalling **225 tests**. Each file targets a specific module.

### `string-similarity.test.ts` — 35 tests

Validates the low-level string utility functions that underpin entity matching across the entire system.

| Function | What is tested |
|----------|----------------|
| `stripDiacritics` | Latin accented characters → ASCII equivalents, ligatures (Æ/æ), sharp-s (ß), passthrough of plain ASCII |
| `normalizeString` | Lowercasing, whitespace collapsing, diacritic stripping, non-alphanumeric removal, number preservation |
| `normalizeEntityName` | Legal suffix removal (Ltd, LLC, GmbH, AG, S.A., B.V., etc.), mixed suffix + diacritics handling |
| `jaroSimilarity` | Known reference values (MARTHA/MARHTA), identical strings, empty strings, completely different strings, symmetry |
| `jaroWinklerSimilarity` | Common-prefix boost, known reference values (DIXON/DICKSONX), prefix cap at 4 characters, determinism across repeated calls |
| `isNormalizedExactMatch` | Case-insensitive matching, diacritic-insensitive matching, punctuation tolerance, empty-string rejection |
| `hasIdentifierOverlap` | Normalized overlap detection, empty arrays, empty-string identifiers |

---

### `all-control-paths.test.ts` — 10 tests

Validates the depth-first ownership-path discovery algorithm that finds all `owns_pct` paths between two entities in the graph.

| Scenario | What is tested |
|----------|----------------|
| Missing entities | Throws `EntityNotFoundError` for unknown source or target |
| No edges | Returns empty result when graph has no relationships |
| Single direct path | Correctly traces a two-hop ownership chain with exact percentages |
| Multiple parallel paths | Discovers all distinct paths between source and target |
| Configurable max depth | Respects `maxDepth` parameter to limit traversal depth |
| Minimum edge percentage | Respects `minEdgePct` to filter weak ownership links |
| Cycle detection | Avoids infinite loops when circular ownership exists |
| Non-ownership edges | Does not traverse `director_of` or other non-ownership edge types |
| Same source and target | Returns a single empty path with depth 0 |

---

### `compute-control.test.ts` — 10 tests

Validates the effective-control aggregation algorithm that computes total ownership percentage from multiple control paths.

| Scenario | What is tested |
|----------|----------------|
| Empty input | Returns 0% control, empty breakdown, threshold not reached |
| Single path | Correctly multiplies chain percentages (e.g., 50% × 40% = 20%) |
| Parallel paths | Sums individual path contributions; checks 25% threshold detection |
| Duplicate paths | Deduplicates identical paths to avoid double-counting |
| Cyclic paths | Filters out paths containing node-revisiting loops |
| Missing percentages | Defaults `undefined` ownership values to 0 |
| Invalid values (< 0) | Throws `RangeError` |
| Invalid values (> 1) | Throws `RangeError` |
| NaN values | Throws `RangeError` |
| Custom threshold | Respects a user-supplied threshold (e.g., 40% instead of default 25%) |

---

### `find-shared-attributes.test.ts` — 39 tests

Validates the shared-attribute detection algorithm, which identifies entities sharing phone numbers, emails, addresses, tax IDs, and other identifying attributes.

**Two modes are tested:**

1. **List Mode** — operates on raw `EntityNode[]` and `EvidenceEdge[]` arrays.
2. **GraphManager Mode** — operates on a `GraphManager` instance with pre-loaded entities and edges.

| Category | What is tested |
|----------|----------------|
| Phone matching | Differently formatted phone numbers (e.g., `+1 555-0100` vs `+1 (555) 0100`) normalize and match |
| Email matching | Case-insensitive email comparison |
| Address matching | Normalized street-address matching |
| Tax ID matching | Tax identifier matching across formatting differences |
| Multi-attribute matching | Entities sharing multiple attribute types simultaneously |
| Three-way matching | Groups of 3+ entities sharing the same attribute |
| Confidence scoring | Correct confidence contribution per attribute type |
| No overlap | Returns empty results when entities share no attributes |
| Single entity | Returns no matches (minimum 2 required) |
| Empty attribute values | Skips blank / whitespace-only attribute values |
| Attribute key classification | Maps keys like `hq_address` → address, `fax_number` → phone, `vat_code` → tax_id |
| GraphManager integration | Correctly discovers shared attributes via graph traversal |
| Deterministic ordering | Results are sorted by confidence (descending), then entity IDs (lexicographic) |

---

### `co-consignee-links.test.ts` — 26 tests

Validates the co-consignee link discovery algorithm, which finds entities that appear together on the same shipment (Bill of Lading) records.

| Category | What is tested |
|----------|----------------|
| Simple co-consignee | Two entities on the same shipment are linked |
| Multiple shared shipments | Shared count and strength increase with more shared voyages |
| Three-way co-consignees | Correctly links all pairs in a 3-entity shipment |
| Mixed edge types | Handles `consignee_on` and `shipper_on` edges on the same voyage |
| Unrelated entities | Returns no links for entities with no shared shipments |
| Unknown entity | Returns zero links with the entity echoed back |
| Non-trade edges | Ignores `owns_pct`, `director_of`, and other non-trade edges |
| Self-links | Entities are not linked to themselves |
| GraphManager integration | Overloaded signatures work with `GraphManager` instances |
| Deterministic ordering | Results sorted by shared count descending, then by peer ID |

---

### `score-evidence.test.ts` — 68 tests

Validates the five-factor evidence confidence scoring formula. This is the most extensively tested algorithm.

| Category | What is tested |
|----------|----------------|
| Normal scoring | High score for Tier 1 registry data; medium score for older trade data; low score for stale, low-tier sources |
| Dataset factor | Correct base scores for `registry`, `opensanctions`, `trade`, `synthetic` |
| Reliability factor | Tier 1 = 1.0, Tier 2 = 0.7, Tier 3 = 0.4 |
| Recency factor | Decay from 1.0 (< 1 year) through 0.5 (> 5 years); missing dates default to 0.5 |
| Completeness factor | Scoring based on presence/absence of optional fields (`observed_date`, `match_rule`) |
| Provenance factor | Correct scores per extraction method (`registry_filing` = 1.0, `entity_resolution` = 0.7, etc.) |
| Custom weights | Overriding individual weight factors changes the final score |
| Corroboration bonus | Edges with multiple corroborating sources get a capped bonus |
| Quality penalty | Score degradation for missing optional metadata fields |
| Confidence levels | Correct band assignment: ≥ 0.85 → high, ≥ 0.65 → medium, else → low |
| Edge cases | All-zero weights, zero corroboration, perfect edge, minimal edge |
| DEFAULT_WEIGHTS | Correct default values; sum to 1.0 |
| Determinism | Identical inputs always produce identical outputs; scores rounded to 3 decimal places |
| Backward compatibility | `score` ≡ `confidenceScore`, `level` ≡ `confidenceLevel` |

---

### `assemble-dossier.test.ts` — 37 tests

Validates the dossier assembly pipeline — the top-level function that aggregates results from all other algorithms into a single `ComprehensiveDossier` output.

| Category | What is tested |
|----------|----------------|
| Minimal valid input | Produces a well-formed dossier from empty algorithm outputs |
| Entity summary | Correct name, type, jurisdiction, attribute counts from the target entity |
| Ownership section | Integrates `computeControl` results; effective control percentages; path breakdowns |
| Evidence section | Aggregates `scoreEvidence` results; average/min/max confidence; per-edge detail |
| Entity resolution section | Includes `resolveEntity` matches with scores and confidence bands |
| Shared attributes | Integrates `findSharedAttributes` results into the dossier |
| Co-consignee links | Integrates `coConsigneeLinks` results into the dossier |
| Sanctions section | Includes sanction matches and screening results |
| Recommendations | Generates risk-appropriate recommendations (investigate, monitor, clear) |
| Missing sections | Gracefully handles `undefined` / empty sub-results |
| GraphManager integration | Works with `GraphManager`-sourced data |
| Determinism | Same inputs always produce the same dossier structure and content |

---

## Edge Cases Covered

The test suite places particular emphasis on boundary conditions and adversarial inputs:

| Edge Case | Tested In |
|-----------|-----------|
| **Empty graphs** (no nodes, no edges) | `all-control-paths`, `co-consignee-links`, `find-shared-attributes` |
| **Duplicate nodes** (same ID added twice) | `all-control-paths` (via `GraphManager` which throws `DuplicateEntityError`) |
| **Duplicate edges** (same edge ID added twice) | `compute-control` (path deduplication logic) |
| **Missing ownership values** (`undefined` on `owns_pct` edge) | `compute-control` (defaults to 0) |
| **Cyclic ownership** (A → B → C → A) | `all-control-paths` (cycle detection), `compute-control` (cycle filtering) |
| **Invalid input** (NaN, negative, > 1.0 percentages) | `compute-control` (throws `RangeError`) |
| **Empty datasets** (empty entity/edge arrays) | `find-shared-attributes`, `co-consignee-links`, `assemble-dossier` |
| **Whitespace-only attribute values** | `find-shared-attributes` (trimmed to empty → skipped) |
| **Self-referencing queries** (source = target) | `all-control-paths` (returns trivial empty path) |
| **Non-ownership edge traversal** | `all-control-paths` (ignores `director_of`, etc.) |
| **Empty / whitespace-only strings** | `string-similarity` (all normalization functions) |
| **Single entity input** | `find-shared-attributes` (no matches possible) |
| **Unknown entity IDs** | `all-control-paths` (throws `EntityNotFoundError`), `co-consignee-links` (returns empty result) |

---

## Expected Result

A successful test run produces output similar to:

```
 ✓ tests/string-similarity.test.ts (35 tests) 10ms
 ✓ tests/compute-control.test.ts (10 tests) 11ms
 ✓ tests/score-evidence.test.ts (68 tests) 26ms
 ✓ tests/co-consignee-links.test.ts (26 tests) 26ms
 ✓ tests/all-control-paths.test.ts (10 tests) 10ms
 ✓ tests/find-shared-attributes.test.ts (39 tests) 28ms
 ✓ tests/assemble-dossier.test.ts (37 tests) 24ms

 Test Files  7 passed (7)
      Tests  225 passed (225)
   Start at  12:05:43
   Duration  1.03s
```

All **7 test files** must pass with **225 tests** and **0 failures**.

---

## Troubleshooting

### `Cannot find module` or `ERR_MODULE_NOT_FOUND`

**Cause:** Dependencies are not installed.

```bash
cd packages/core
npm install
```

### `TS2688: Cannot find type definition file for 'node'`

**Cause:** The root workspace's `node_modules` contains `@types/*` packages from other packages (e.g., `mcp-server`, `orchestrator`) that pollute TypeScript's type resolution.

**Fix:** The core `tsconfig.json` already sets `"types": []` to prevent this. If you see this error, ensure you are running `tsc` from `packages/core`, not the workspace root.

### IDE shows red squiggly lines but `npm test` passes

**Cause:** The TypeScript language server is using stale `.d.ts` files from a previous build.

**Fix:**
1. Rebuild: `npm run clean && npm run build` (or `npm run clean ; npm run build` on PowerShell).
2. Restart the TypeScript server in your editor:
   - VSCode: `Ctrl+Shift+P` → **TypeScript: Restart TS Server**

### `npm run build` fails at workspace level with `Missing script: "build"` for `@bruteforce/data`

**Cause:** The `@bruteforce/data` package contains only static data files and has no `build` script.

**Fix:** Build only the core package:

```bash
cd packages/core
npm run build
```

### Tests hang or time out

**Cause:** Unlikely given the pure-function design, but can happen if `node_modules` is corrupted (especially on Windows with OneDrive sync).

**Fix:**
```bash
rm -rf node_modules
npm install
npm test
```

### `ECONNRESET` during `npm install`

**Cause:** Network connectivity issue (proxy, VPN, or unstable connection).

**Fix:** Retry, or configure npm to use a different registry:
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

---

## Notes

- **Determinism guarantee:** Every algorithm in `@bruteforce/core` is a pure function. Given the same inputs, it will always produce the same output. Several test files include explicit determinism verification tests (e.g., `score-evidence.test.ts` runs the same scoring function 3 times and asserts `r1 === r2 === r3`).

- **No mocking required:** Because the core package has zero I/O dependencies, all tests operate on real data structures with no mocks, stubs, or test doubles. The only test helpers are factory functions (`makeNode`, `makeEdge`, etc.) that create minimal valid domain objects.

- **Floating-point precision:** Tests use `toBeCloseTo()` with explicit decimal-place arguments for floating-point comparisons. The `scoreEvidence` algorithm rounds all final scores to 3 decimal places.

- **Coverage exclusions:** Barrel `index.ts` re-export files are excluded from coverage metrics (they contain no logic).

- **Test isolation:** Each test case creates its own `GraphManager` instance or data structures. No shared mutable state exists between tests.
