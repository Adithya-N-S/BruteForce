/**
 * @module types
 * @description
 * Canonical shared types for the VEILBREAKER deterministic evidence-graph core.
 *
 * This file is the **single source of truth** for every data shape that crosses
 * a package boundary. It is frozen at Milestone M1 — changes after that require
 * a team huddle.
 *
 * Design invariants:
 *   1. Every edge carries provenance (`source_dataset` + `record_id`).
 *   2. Percentages come only from `compute_control`.
 *   3. Confidence numbers come only from `score_evidence`.
 *   4. No type in this file depends on I/O, a database, or an LLM.
 *
 * @see 01_MASTER_CONTEXT.md §14 (MCP Architecture)
 * @see 01_MASTER_CONTEXT.md §15 (Graph Schema)
 */
export {};
//# sourceMappingURL=types.js.map