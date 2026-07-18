# References

This document declares the external libraries, algorithms, and official resources used by the `@bruteforce/core` package.

---

## Libraries

| Library | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| **Graphology** | `^0.25.4` | In-memory directed graph data structure. Powers the `GraphManager` class that stores entities as nodes and evidence relationships as edges. | [graphology.github.io](https://graphology.github.io/) |
| **graphology-types** | `^0.24.7` | TypeScript type definitions for Graphology. Provides generic type parameters for node/edge attributes used in `GraphManager`. | [graphology.github.io](https://graphology.github.io/) |
| **TypeScript** | `^5.5.0` | Statically typed superset of JavaScript. Used as the primary implementation language with strict mode enabled for maximum type safety. | [typescriptlang.org](https://www.typescriptlang.org/docs/) |
| **Vitest** | `^2.0.0` | Unit test framework with native ESM and TypeScript support. Runs all 225 tests in the core package. | [vitest.dev](https://vitest.dev/) |
| **rimraf** | `^6.0.0` | Cross-platform `rm -rf` utility. Used by the `npm run clean` script to remove compiled output in `dist/`. | [github.com/isaacs/rimraf](https://github.com/isaacs/rimraf) |

> **Note:** The core package has no runtime dependencies beyond Graphology. All other packages are development-only.

---

## Algorithms

### Depth-First Search (DFS) — `all-control-paths`

Enumerates all ownership paths between a source and target entity by performing a recursive depth-first traversal of `owns_pct` edges. The algorithm maintains a visited-node set along each search path to detect and avoid cycles, preventing infinite loops in circular ownership structures. Configurable parameters include maximum traversal depth and minimum edge ownership percentage.

### Multiplicative Chain Aggregation — `compute-control`

Computes effective control along each ownership path by multiplying the ownership fractions at each hop (e.g., 50% × 40% = 20%). Parallel paths are summed to produce total effective control. The algorithm deduplicates identical paths, filters cyclic paths, and validates that all ownership values fall within [0, 1]. A configurable threshold (default 25%) determines whether the aggregate control is considered significant.

### Jaro Similarity

Computes character-level similarity between two strings using the classic Jaro metric. Two characters are considered matching if they are identical and within ⌊max(|s1|, |s2|) / 2⌋ − 1 positions of each other. The score combines matching character count and transposition count into a value in [0, 1].

> **Reference:** Jaro, M. A. (1989). "Advances in Record-Linkage Methodology as Applied to Matching the 1985 Census of Tampa, Florida." *Journal of the American Statistical Association*, 84(406), 414–420.

### Jaro-Winkler Similarity

Extends Jaro similarity with a prefix bonus that boosts scores for strings sharing a common prefix (up to 4 characters), reflecting the empirical observation that name variations are less likely at the start of a word. Uses the standard Winkler scaling factor of 0.1.

> **Reference:** Winkler, W. E. (1990). "String Comparator Metrics and Enhanced Decision Rules in the Fellegi-Sunter Model of Record Linkage." *Proceedings of the Section on Survey Research Methods*, American Statistical Association, 354–359.

### Entity Name Normalization

A multi-stage text normalization pipeline applied before all name comparisons:

1. Trim and lowercase.
2. Strip diacritical marks using a lookup table for common Latin characters, with Unicode NFD decomposition as fallback.
3. Remove non-alphanumeric characters (except spaces).
4. Collapse whitespace.
5. Strip common legal suffixes (Ltd, LLC, GmbH, AG, S.A., B.V., Corp, Inc, etc.).

### Weighted Multi-Factor Evidence Scoring — `score-evidence`

Assigns a confidence score in [0, 1] to each evidence edge using a weighted average of up to seven factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Dataset | 0.2 | Base quality of the source dataset (registry, sanctions, trade, synthetic) |
| Reliability | 0.3 | Source reliability tier (Tier 1 = 1.0, Tier 2 = 0.7, Tier 3 = 0.4) |
| Recency | 0.2 | Time decay based on observation date (< 1 year = 1.0, > 5 years = 0.5) |
| Completeness | 0.1 | Presence of optional metadata fields |
| Provenance | 0.2 | Confidence in the extraction method |
| Corroboration | 0.1 | Bonus for multiple supporting sources (optional) |
| Quality | 0.1 | General qualitative assessment (optional) |

Optional factors are excluded from both numerator and weight sum when not applicable, maintaining correct scaling. Final scores are rounded to 3 decimal places and mapped to confidence bands: high (≥ 0.85), medium (≥ 0.65), low (< 0.65).

### Shared Attribute Detection — `find-shared-attributes`

Groups entities by normalized attribute values (phone, email, address, tax ID, etc.) to discover hidden connections. Attribute keys are classified into semantic types using substring matching (e.g., a key containing `phone` or `fax` maps to the `phone` type). Values are normalized per type (phone numbers stripped to digits, emails lowercased, addresses normalized). Confidence contributions are assigned per attribute type, and results are sorted deterministically.

### Co-Consignee Link Discovery — `co-consignee-links`

Identifies entities that co-occur on trade documents (Bills of Lading) by scanning `consignee_on` and `shipper_on` edges that share a common vessel/shipment node. Link strength increases with the number of shared shipments. The algorithm supports both raw `EvidenceGraph` input and `GraphManager` instances.

### Entity Resolution — `resolve-entity`

Matches a query (name + optional identifiers) against a candidate entity list using a combination of Jaro-Winkler name similarity and exact identifier overlap. Candidates are scored, assigned confidence bands, and returned sorted by score descending.

### Dossier Assembly — `assemble-dossier`

Aggregation pipeline that combines outputs from all other algorithms (entity resolution, control paths, evidence scoring, shared attributes, co-consignee links, sanctions matching) into a single `ComprehensiveDossier` structure with investigation summary, ownership breakdown, evidence confidence, and risk recommendations.

---

## Standards and Best Practices

### SOLID Principles

- **Single Responsibility:** Each algorithm module handles exactly one concern (e.g., `score-evidence` only scores, `compute-control` only aggregates).
- **Open/Closed:** The `ScoreWeights` interface allows extending scoring behavior without modifying the core algorithm.
- **Liskov Substitution:** All algorithm functions accept `readonly` interfaces, ensuring consumers cannot accidentally mutate shared data.
- **Interface Segregation:** Separate interfaces for each algorithm's input/output (e.g., `ControlPathResult`, `ScoreEvidenceResult`, `SharedAttributesResult`).
- **Dependency Inversion:** Algorithms depend on abstract interfaces (`EntityNode`, `EvidenceEdge`) rather than concrete graph implementations.

### Clean Architecture

- The core package contains **zero I/O** — no database, no network, no filesystem access, no LLM calls.
- All functions are **pure** — same inputs always produce the same outputs.
- Domain types (`types.ts`) are the innermost layer and have no dependencies on any other module.

### TypeScript Best Practices

- **Strict mode** enabled with additional strictness flags (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`).
- **`readonly` throughout** — all interface properties and function parameters use `readonly` to enforce immutability.
- **Branded type aliases** — `EntityId` provides semantic meaning over raw `string`.
- **Exhaustive type unions** — `EntityType`, `EvidenceEdgeType`, `EvidenceDataset` are closed unions.
- **ES module native** — `"type": "module"` with `moduleResolution: "bundler"`.

### Determinism

Every algorithm is designed to be fully deterministic:
- No use of `Math.random()`, `Date.now()`, or any non-deterministic source.
- Sort operations use stable, lexicographic comparators.
- Floating-point results are rounded to fixed decimal places.
- Evaluation dates are passed as explicit parameters, never read from the system clock.

---

## Documentation Sources

| Resource | URL |
|----------|-----|
| Graphology Documentation | [https://graphology.github.io/](https://graphology.github.io/) |
| TypeScript Documentation | [https://www.typescriptlang.org/docs/](https://www.typescriptlang.org/docs/) |
| TypeScript Handbook | [https://www.typescriptlang.org/docs/handbook/](https://www.typescriptlang.org/docs/handbook/) |
| Vitest Documentation | [https://vitest.dev/guide/](https://vitest.dev/guide/) |
| Node.js Documentation | [https://nodejs.org/docs/latest-v20.x/api/](https://nodejs.org/docs/latest-v20.x/api/) |
| npm Documentation | [https://docs.npmjs.com/](https://docs.npmjs.com/) |
| MDN Web Docs (JavaScript) | [https://developer.mozilla.org/en-US/docs/Web/JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) |
| Unicode Normalization (NFD) | [https://unicode.org/reports/tr15/](https://unicode.org/reports/tr15/) |

---

## AI Assistance

AI-assisted development tools were used during the implementation and documentation of this project:

- **Antigravity IDE** (Google DeepMind) — used for code generation, review, debugging, and documentation assistance.
- **ChatGPT** (OpenAI) — used for algorithm design discussion and documentation drafting.

All generated code was reviewed, tested, and integrated by the development team. The final implementation, architectural decisions, and test coverage are the responsibility of the **BruteForce** team.
