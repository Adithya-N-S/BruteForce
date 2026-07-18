/**
 * @fileoverview D4 Phase 3 — Synthetic planted case (VEILBREAKER §3.6).
 *
 * The seed JSON is committed under `packages/data/seed/planted_case.json`. This module
 * imports it (via a JSON cast, resolved through the data package's tsconfig) and exposes
 * it as a typed `EvidenceGraph` plus the sanctions entries — the deterministic input
 * that makes the Phase 3 demo reliable.
 *
 * Determinism: importing the same JSON always yields the same graph. No runtime I/O,
 * no LLM. The *planted linkage* is synthetic and labelled (see the JSON `meta`);
 * the contribution is the method, not the data.
 *
 * This is the canonical demo graph consumed by the Evader perturbation
 * (`evader-perturb.ts`) and the golden-path replay validators (`golden-path.ts`).
 */

import type {
  EvidenceGraph,
  EntityNode,
  EvidenceEdge,
  SanctionMatch,
  EntityType,
  EvidenceEdgeType,
  EvidenceDataset,
  ExtractionMethod,
  ReliabilityTier,
} from '@bruteforce/core';

import raw from '../seed/planted_case.json' assert { type: 'json' };

interface SeedNode {
  id: string;
  type: EntityType;
  name: string;
  jurisdiction?: string;
  attributes?: Record<string, unknown>;
}

interface SeedEdge {
  id: string;
  from: string;
  to: string;
  type: EvidenceEdgeType;
  value?: number;
  source_dataset: EvidenceDataset;
  record_id: string;
  observed_date?: string;
  extraction_method: ExtractionMethod;
  match_rule?: string;
  reliability_tier: ReliabilityTier;
}

interface SeedSanction {
  sanction_id: string;
  list: string;
  name: string;
  aliases?: string[];
  score: number;
}

interface SeedFile {
  meta: { case: string; description: string; sources_declared: string[] };
  nodes: SeedNode[];
  edges: SeedEdge[];
  sanctions: SeedSanction[];
}

const seed = raw as unknown as SeedFile;

/** The planted case graph — typed and ready for deterministic ingestion. */
export const plantedCaseGraph: EvidenceGraph = {
  nodes: seed.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    jurisdiction: n.jurisdiction ?? '',
    attributes: n.attributes ?? {},
  })) as readonly EntityNode[],
  edges: seed.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    type: e.type,
    value: e.value,
    source_dataset: e.source_dataset,
    record_id: e.record_id,
    observed_date: e.observed_date,
    extraction_method: e.extraction_method,
    match_rule: e.match_rule,
    reliability_tier: e.reliability_tier,
  })) as readonly EvidenceEdge[],
};

/** Sanctions entries for the planted case (shape matches `SanctionMatch`). */
export const plantedCaseSanctions: SanctionMatch[] = seed.sanctions.map((s) => ({
  sanction_id: s.sanction_id,
  list: s.list,
  rationale: `Name match against declared list '${s.list}' (aliases: ${(s.aliases ?? []).join(', ') || 'none'}).`,
  score: s.score,
}));

/**
 * Raw sanction seeds in the shape the core `matchSanctions` matcher consumes
 * (it reads `id`, `name`, and `list`). Used by the demo dry-run to exercise the
 * real matcher; the canonical `plantedCaseSanctions` above preserves the
 * frozen `SanctionMatch` contract for downstream consumers.
 */
export const plantedCaseSanctionSeeds: Array<{
  id: string;
  name: string;
  list: string;
  score: number;
}> = seed.sanctions.map((s) => ({
  id: s.sanction_id,
  name: s.name,
  list: s.list,
  score: s.score,
}));

/** Declared real/source provenance for the R12 disclosure requirement. */
export const plantedCaseSources: string[] = seed.meta.sources_declared;

export const plantedCaseId = seed.meta.case;
