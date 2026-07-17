export type EntityNode = {
  id: string;
  type: "company" | "person" | "address" | "vessel" | "agent";
  name: string;
  jurisdiction?: string;
  attributes: Record<string, string>;
  source_dataset: "opensanctions" | "registry" | "trade" | "synthetic";
};

export type EvidenceEdge = {
  id: string;
  from: string;
  to: string;
  type: "owns_pct" | "director_of" | "registered_at" | "consignee_on"
      | "shipper_on" | "agent_for" | "listed_sanctioned" | "same_as";
  value?: number;
  source_dataset: "opensanctions" | "registry" | "trade" | "synthetic";
  record_id: string;
  observed_date?: string;
  extraction_method: string;
  match_rule?: string;
  reliability_tier: 1 | 2 | 3;
};

export type SourceRecord = {
  record_id: string;
  dataset: string;
  raw: Record<string, unknown>;
  url_or_ref: string;
  observed_date?: string;
};

export type SeedData = {
  entities: EntityNode[];
  edges: EvidenceEdge[];
  source_records: SourceRecord[];
};
