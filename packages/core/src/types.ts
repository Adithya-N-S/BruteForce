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

// ─────────────────────────────────────────────────────────────────────────────
// Primitives & Branded Aliases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unique identifier for any entity (company, person, address, vessel, agent)
 * in the evidence graph. Opaque string — consumers must not parse its contents.
 */
export type EntityId = string;

// ─────────────────────────────────────────────────────────────────────────────
// Closed Unions (extend only via types.ts update + team sign-off)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exhaustive set of entity categories tracked in the evidence graph.
 *
 * | Value       | Meaning                                            |
 * |-------------|----------------------------------------------------|
 * | `company`   | A legal entity (corporation, LLC, trust, etc.)     |
 * | `person`    | A natural person (director, UBO, nominee, etc.)    |
 * | `address`   | A registered or mailing address                    |
 * | `vessel`    | A shipping vessel identified in trade records      |
 * | `agent`     | A corporate service agent or registered agent      |
 */
export type EntityType = 'company' | 'person' | 'address' | 'vessel' | 'agent';

/**
 * The exhaustive set of typed relationships that may exist between entities
 * in the evidence graph. Each value maps to a specific data-domain interpretation.
 *
 * | Value               | Domain               | Interpretation                        |
 * |---------------------|----------------------|---------------------------------------|
 * | `owns_pct`          | Ownership            | Direct ownership with a % `value`     |
 * | `director_of`       | Corporate governance | Entity is a director of a company     |
 * | `registered_at`     | Corporate registry   | Entity is registered at an address    |
 * | `consignee_on`      | Trade / BoL          | Entity is a consignee on a shipment   |
 * | `shipper_on`        | Trade / BoL          | Entity is a shipper on a shipment     |
 * | `agent_for`         | Corporate services   | Entity acts as agent for another      |
 * | `listed_sanctioned` | Sanctions            | Entity is listed on a sanctions list  |
 * | `same_as`           | Entity resolution    | Two records refer to the same entity  |
 */
export type EvidenceEdgeType =
  | 'owns_pct'
  | 'director_of'
  | 'registered_at'
  | 'consignee_on'
  | 'shipper_on'
  | 'agent_for'
  | 'listed_sanctioned'
  | 'same_as';

/**
 * The data source that produced a given edge.
 *
 * | Value            | Source                         | Typical reliability |
 * |------------------|--------------------------------|---------------------|
 * | `opensanctions`  | OpenSanctions consolidated     | Tier 1              |
 * | `registry`       | Corporate registry / ICIJ      | Tier 1–2            |
 * | `trade`          | Bill-of-lading / trade records | Tier 2–3            |
 * | `synthetic`      | Planted demo / test data       | N/A (test only)     |
 */
export type EvidenceDataset = 'opensanctions' | 'registry' | 'trade' | 'synthetic';

/**
 * Source reliability tier. Lower is more reliable.
 *
 * - **1** — Official registry filing, government-published list.
 * - **2** — Leaked dataset, curated investigative database.
 * - **3** — Web scrape, unverified third-party extract.
 */
export type ReliabilityTier = 1 | 2 | 3;

/**
 * Categorical confidence band produced by entity resolution.
 *
 * - **high**   — Score ≥ 0.85; match can be accepted automatically.
 * - **medium** — Score in [0.65, 0.85); gray band, human confirmation advised.
 * - **low**    — Score in [0.50, 0.65); weak signal, flagged but not actionable.
 */
export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * The method by which an edge was extracted from a source record.
 * Used for provenance auditing and confidence scoring.
 */
export type ExtractionMethod =
  | 'registry_filing'
  | 'bill_of_lading_field'
  | 'sanctions_list_entry'
  | 'entity_resolution'
  | 'manual_seed'
  | 'co_consignee_derivation';

// ─────────────────────────────────────────────────────────────────────────────
// Entity Model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A node in the evidence graph representing a real-world entity.
 *
 * Designed for direct storage as graphology node attributes.
 * The `id` field doubles as the graphology node key.
 *
 * @example
 * ```ts
 * const company: EntityNode = {
 *   id: 'ent-001',
 *   type: 'company',
 *   name: 'Meridian Trading Corp.',
 *   jurisdiction: 'BVI',
 *   attributes: {
 *     registration_number: 'BVI-29481',
 *     incorporation_date: '2015-03-12',
 *   },
 * };
 * ```
 */
export interface EntityNode {
  /** Unique, stable identifier for this entity. Used as the graphology node key. */
  readonly id: EntityId;

  /** The category of real-world object this entity represents. */
  readonly type: EntityType;

  /** The primary display name of the entity (original casing preserved). */
  readonly name: string;

  /**
   * ISO 3166-1 alpha-2/alpha-3 country code or jurisdiction abbreviation
   * (e.g., `'BVI'`, `'US'`, `'CY'`). Empty string if unknown.
   */
  readonly jurisdiction: string;

  /**
   * Open-ended key-value bag for domain-specific attributes that do not
   * warrant first-class fields (e.g., `registration_number`, `date_of_birth`,
   * `phone`, `aliases`).
   *
   * Keys are `snake_case` strings; values are JSON-serialisable primitives
   * or arrays of primitives.
   */
  readonly attributes: Readonly<Record<string, unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Edge Model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A directed, provenance-rich relationship between two entities.
 *
 * This is the **atomic unit of evidence** in VEILBREAKER. Every assertion
 * about the world is expressed as an `EvidenceEdge` backed by a specific
 * `record_id` in the provenance store. Edges without provenance fields
 * are structurally impossible (all provenance fields are required).
 *
 * Stored as graphology edge attributes; `id` is the edge key, `from`/`to`
 * are the source/target node keys.
 *
 * @see 01_MASTER_CONTEXT.md §14.3 — Tool contracts
 */
export interface EvidenceEdge {
  /** Unique identifier for this edge. Used as the graphology edge key. */
  readonly id: string;

  /** Source entity (graphology source node key). */
  readonly from: EntityId;

  /** Target entity (graphology target node key). */
  readonly to: EntityId;

  /** Semantic type of the relationship. */
  readonly type: EvidenceEdgeType;

  /**
   * Numeric value associated with the edge, if applicable.
   * For `owns_pct` edges this is the ownership fraction in [0, 1]
   * (e.g., 0.52 means 52 %).
   */
  readonly value?: number;

  /** Which dataset this edge was derived from. */
  readonly source_dataset: EvidenceDataset;

  /**
   * Foreign key into the provenance store (`SourceRecord.record_id`).
   * Enables "click any edge → see the document" in the UI.
   */
  readonly record_id: string;

  /** ISO 8601 date string when the underlying record was observed. */
  readonly observed_date?: string;

  /** How the edge was extracted from the raw source record. */
  readonly extraction_method: ExtractionMethod;

  /**
   * If the edge was produced by entity resolution, the rule that fired
   * (e.g., `'name:jaro=0.94+jurisdiction:exact'`).
   */
  readonly match_rule?: string;

  /** Source reliability tier (1 = most reliable). */
  readonly reliability_tier: ReliabilityTier;

  /**
   * Edge-level confidence score in [0, 1], populated by `score_evidence`.
   * `undefined` until scored.
   */
  readonly confidence?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Graph (Serialisable Snapshot)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A serialisable snapshot of the entire evidence graph (nodes + edges).
 *
 * This is the shape returned by the `veilbreaker://graph/evidence` MCP
 * Resource and consumed by the frontend for rendering. It is **not** the
 * live in-memory graph (that is a graphology `DirectedGraph` inside
 * `GraphManager`).
 *
 * @see 01_MASTER_CONTEXT.md §14.1 — Resources
 */
export interface EvidenceGraph {
  /** All entity nodes currently in the graph. */
  readonly nodes: readonly EntityNode[];

  /** All provenance-stamped edges currently in the graph. */
  readonly edges: readonly EvidenceEdge[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance Store Record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A raw source record in the provenance store. One `SourceRecord` may back
 * multiple `EvidenceEdge`s (e.g., a single registry filing produces an
 * `owns_pct` edge and a `registered_at` edge).
 *
 * @see 01_MASTER_CONTEXT.md §15 — Graph Schema
 */
export interface SourceRecord {
  /** Primary key; referenced by `EvidenceEdge.record_id`. */
  readonly record_id: string;

  /** The dataset this record belongs to. */
  readonly dataset: EvidenceDataset;

  /**
   * The raw record payload exactly as it was ingested.
   * Stored as opaque JSON — never interpreted by algorithms.
   */
  readonly raw: Readonly<Record<string, unknown>>;

  /**
   * A URL or bibliographic reference where the record can be independently
   * verified (e.g., an ICIJ link, an OpenSanctions page, a government gazette).
   */
  readonly url_or_ref: string;

  /** ISO 8601 date string when the record was observed or published. */
  readonly observed_date: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Confidence (output of score_evidence)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of the deterministic `score_evidence` tool.
 *
 * Confidence is computed per-edge via the formula in §14.4, and the
 * aggregate confidence of a path is the **minimum** edge confidence
 * (a chain is only as strong as its weakest link).
 *
 * @see 01_MASTER_CONTEXT.md §14.4 — Confidence Function
 */
export interface EvidenceConfidence {
  /** The edges with their `.confidence` fields now populated. */
  readonly scored: readonly EvidenceEdge[];

  /**
   * The minimum edge confidence across the scored path.
   * In [0, 1]. This is the number shown to the user.
   */
  readonly aggregate_confidence: number;

  /** The edge with the lowest confidence — the investigation's weak point. */
  readonly weakest_link: EvidenceEdge;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Path & Compute Result (output of compute_control)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single directed path from a root entity to a target entity,
 * where each hop is an `owns_pct` edge. The `path_control` is the
 * **product** of the ownership fractions along the path.
 */
export interface ControlPath {
  /** The ordered sequence of edges forming this control chain. */
  readonly path: readonly EvidenceEdge[];

  /**
   * Effective control fraction for this specific path.
   * Computed as the product of each edge's `value` (ownership %).
   * In [0, 1].
   */
  readonly path_control: number;
}

/**
 * Result of the deterministic `compute_control` tool.
 *
 * `effective_control` is the **sum** of `path_control` over all parallel
 * paths from `root` to `target`. If it meets or exceeds the 25 % threshold,
 * beneficial ownership is established.
 *
 * This is the **only** source of ownership percentages shown on screen.
 *
 * @see 01_MASTER_CONTEXT.md §14.3 — `compute_control` contract
 */
export interface ComputeControlResult {
  /**
   * Aggregate effective control fraction from root to target.
   * Sum of `path_control` over all `contributing_paths`. In [0, 1].
   */
  readonly effective_control: number;

  /** Every path that contributes to the aggregate control. */
  readonly contributing_paths: readonly ControlPath[];

  /** The beneficial-ownership threshold (fixed at 0.25 / 25 %). */
  readonly threshold: 0.25;

  /** Whether `effective_control >= threshold`. */
  readonly meets_threshold: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Resolution (output of resolve_entity)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input query for deterministic entity resolution.
 * At least one field must be provided. More fields yield higher-quality matches.
 */
export interface ResolveEntityInput {
  /** Entity name to match (original casing). */
  readonly name?: string;

  /** Physical or registered address to match. */
  readonly address?: string;

  /**
   * Known identifiers (registration numbers, tax IDs, passport numbers, etc.)
   * that should produce an exact-match signal.
   */
  readonly identifiers?: readonly string[];

  /** Jurisdiction code to constrain or boost matches. */
  readonly jurisdiction?: string;
}

/**
 * A single candidate match returned by entity resolution.
 *
 * The `score` is a deterministic composite of per-field similarities.
 * The `ambiguous` flag indicates gray-band matches that should be
 * routed to a human analyst for confirmation.
 */
export interface ResolveEntityMatch {
  /** The ID of the matched entity in the evidence graph. */
  readonly entity_id: EntityId;

  /**
   * Composite similarity score in [0, 1].
   * Deterministically computed from weighted field-level similarities.
   */
  readonly score: number;

  /**
   * Human-readable list of which fields contributed to the match
   * and how (e.g., `['name:jaro=0.94', 'jurisdiction:exact']`).
   */
  readonly matched_features: readonly string[];

  /**
   * `true` if the score falls in the gray band [0.65, 0.85) — meaning
   * the match is plausible but should be confirmed by a human.
   * `false` if the score is ≥ 0.85 (high confidence).
   */
  readonly ambiguous: boolean;

  /**
   * Categorical confidence assessment derived from the score.
   * - `'high'`   → score ≥ 0.85
   * - `'medium'` → score in [0.65, 0.85)
   * - `'low'`    → score in [0.50, 0.65)
   */
  readonly confidence: ConfidenceBand;

  /**
   * A deterministic, human-readable explanation of why this entity
   * was matched and which features drove the score.
   *
   * @example
   * "Matched 'Meridian Trading Corp' via Jaro-Winkler (0.94) on name,
   *  exact match on jurisdiction (BVI). Composite score: 0.91."
   */
  readonly explanation: string;
}

/**
 * Complete result of the `resolve_entity` tool.
 * Matches are sorted descending by `score`.
 */
export interface ResolveEntityResult {
  /**
   * Candidate matches above the minimum score threshold (0.50),
   * sorted descending by composite score.
   */
  readonly matches: readonly ResolveEntityMatch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanction Match (output of match_sanctions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single sanctions-list hit for an entity.
 */
export interface SanctionMatch {
  /** Identifier of the sanction entry in the sanctions dataset. */
  readonly sanction_id: string;

  /** Which sanctions list the hit comes from (e.g., `'OFAC'`, `'EU'`, `'UN'`). */
  readonly list: string;

  /** Human-readable rationale for why the entity matched this entry. */
  readonly rationale: string;

  /** Deterministic similarity score in [0, 1]. */
  readonly score: number;
}

/**
 * Result of the `match_sanctions` tool.
 */
export interface MatchSanctionsResult {
  /** All sanctions matches for the queried entity, sorted by score descending. */
  readonly matches: readonly SanctionMatch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier (output of assemble_dossier)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An audit-ready investigation dossier. Assembled deterministically from
 * the evidence graph, scored edges, and computed control.
 */
export interface Dossier {
  /** The entity that was investigated (the starting company). */
  readonly root: EntityId;

  /** The entity identified as the Ultimate Beneficial Owner. */
  readonly target: EntityId;

  /** The computed beneficial ownership result. */
  readonly control: ComputeControlResult;

  /** Evidence confidence assessment for the critical path. */
  readonly evidence_confidence: EvidenceConfidence;

  /** Any sanctions matches found for the target UBO. */
  readonly sanctions: MatchSanctionsResult;

  /** Narrative explanation generated by the Explainer (sourced edges only). */
  readonly narrative?: string;

  /** ISO 8601 timestamp when the dossier was assembled. */
  readonly assembled_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single entry in the append-only audit log.
 * Every MCP tool call produces exactly one audit entry.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp of the tool invocation. */
  readonly timestamp: string;

  /** The MCP tool that was called. */
  readonly tool: string;

  /** The arguments passed to the tool (redacted of secrets). */
  readonly args: Readonly<Record<string, unknown>>;

  /** A brief summary of the result (not the full payload). */
  readonly result_summary: string;

  /** Record IDs that were accessed or created during this call. */
  readonly records_used: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Adjudicator Verdict
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The deterministic output of the Adjudicator — the veil-pierced predicate.
 *
 * The investigation loop terminates when `pierced` is `true`, meaning all
 * three conditions are met:
 *   1. `effective_control >= 0.25`
 *   2. A sanctioned UBO has been identified
 *   3. `overall_confidence >= tau`
 */
export interface AdjudicatorVerdict {
  /** Whether the veil has been pierced (all conditions met). */
  readonly pierced: boolean;

  /** Effective control fraction from root to sanctioned UBO. */
  readonly effective_control: number;

  /** Aggregate evidence confidence (min over the path). */
  readonly overall_confidence: number;

  /** The edge with the lowest individual confidence score. */
  readonly weakest_link: EvidenceEdge | null;
}
