import { readFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { EntityNode, EvidenceEdge, SourceRecord } from "./types.ts";

interface ICIJEntityRow {
  node_id: string;
  name: string;
  jurisdiction: string;
  jurisdiction_description: string;
  countries: string;
  sourceID: string;
  valid_until: string;
  note: string;
  [key: string]: string;
}

interface ICIJOfficerRow {
  node_id: string;
  name: string;
  countries: string;
  country_codes: string;
  sourceID: string;
  valid_until: string;
  note: string;
}

interface ICIJAddressRow {
  node_id: string;
  address: string;
  name: string;
  countries: string;
  country_codes: string;
  sourceID: string;
  valid_until: string;
  note: string;
}

interface ICIJRelationshipRow {
  node_id_start: string;
  node_id_end: string;
  rel_type: string;
  link: string;
  status: string;
  start_date: string;
  end_date: string;
  sourceID: string;
}

const TARGET_JURISDICTIONS = new Set([
  "BVI",
  "VGB",
  "VG",
  "CY",
  "PMA",
  "HK",
  "SG",
  "LI",
]);

function mapRelType(relType: string): string | null {
  switch (relType) {
    case "shareholder of":
    case "shareholder_of":
      return "owns_pct";
    case "officer of":
    case "director of":
    case "officer_of":
    case "director_of":
      return "director_of";
    case "registered address":
    case "registered_address":
      return "registered_at";
    case "intermediary of":
    case "intermediary_of":
      return "agent_for";
    default:
      return null;
  }
}

function readCSV(path: string): any[] {
  if (!existsSync(path)) {
    console.warn(`File not found: ${path}`);
    return [];
  }
  const raw = readFileSync(path, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
}

export async function parseICIJ(): Promise<{
  entities: EntityNode[];
  edges: EvidenceEdge[];
  sourceRecords: SourceRecord[];
}> {
  const entities: EntityNode[] = [];
  const edges: EvidenceEdge[] = [];
  const sourceRecords: SourceRecord[] = [];

  const entityRows: ICIJEntityRow[] = readCSV("raw/nodes-entities.csv");
  const officerRows: ICIJOfficerRow[] = readCSV("raw/nodes-officers.csv");
  const addressRows: ICIJAddressRow[] = readCSV("raw/nodes-addresses.csv");
  const relationshipRows: ICIJRelationshipRow[] = readCSV("raw/relationships.csv");

  const filteredEntityIds = new Set<string>();

  let entityCount = 0;
  for (const row of entityRows) {
    if (entityCount >= 120) break;
    if (TARGET_JURISDICTIONS.has(row.jurisdiction)) {
      filteredEntityIds.add(row.node_id);
      entities.push({
        id: "icij-" + row.node_id,
        type: "company",
        name: row.name || "Unknown Entity",
        jurisdiction: row.countries ? row.countries.substring(0, 2) : undefined,
        attributes: { jurisdiction_desc: row.jurisdiction_description || "" },
        source_dataset: "registry",
      });
      entityCount++;
    }
  }

  const connectedOfficerIds = new Set<string>();
  const connectedAddressIds = new Set<string>();

  for (const rel of relationshipRows) {
    if (filteredEntityIds.has(rel.node_id_start) && !filteredEntityIds.has(rel.node_id_end)) {
      connectedOfficerIds.add(rel.node_id_end);
      connectedAddressIds.add(rel.node_id_end);
    }
    if (filteredEntityIds.has(rel.node_id_end) && !filteredEntityIds.has(rel.node_id_start)) {
      connectedOfficerIds.add(rel.node_id_start);
      connectedAddressIds.add(rel.node_id_start);
    }
  }

  let officerCount = 0;
  for (const row of officerRows) {
    if (officerCount >= 40) break;
    if (connectedOfficerIds.has(row.node_id) || filteredEntityIds.has(row.node_id)) {
      if (entities.some((e) => e.id === "icij-" + row.node_id)) continue;
      connectedOfficerIds.add(row.node_id);
      entities.push({
        id: "icij-" + row.node_id,
        type: "person",
        name: row.name || "Unknown Officer",
        jurisdiction: row.countries ? row.countries.substring(0, 2) : undefined,
        attributes: {},
        source_dataset: "registry",
      });
      officerCount++;
    }
  }

  let addressCount = 0;
  for (const row of addressRows) {
    if (addressCount >= 30) break;
    if (connectedAddressIds.has(row.node_id) || filteredEntityIds.has(row.node_id)) {
      if (entities.some((e) => e.id === "icij-" + row.node_id)) continue;
      connectedAddressIds.add(row.node_id);
      entities.push({
        id: "icij-" + row.node_id,
        type: "address",
        name: row.address || row.name || "Unknown Address",
        attributes: {},
        source_dataset: "registry",
      });
      addressCount++;
    }
  }

  const allValidIds = new Set([
    ...filteredEntityIds,
    ...connectedOfficerIds,
    ...connectedAddressIds,
  ]);

  let edgeIdx = 0;
  for (const rel of relationshipRows) {
    const mappedType = mapRelType(rel.rel_type);
    if (!mappedType) continue;
    if (!allValidIds.has(rel.node_id_start) || !allValidIds.has(rel.node_id_end)) continue;

    const edge: EvidenceEdge = {
      id: "icij-e-" + edgeIdx,
      from: "icij-" + rel.node_id_start,
      to: "icij-" + rel.node_id_end,
      type: mappedType as EvidenceEdge["type"],
      source_dataset: "registry",
      record_id: "icij-src-" + rel.node_id_start + "-" + rel.node_id_end,
      observed_date: rel.start_date || rel.end_date || undefined,
      extraction_method: "icij_leak_record",
      reliability_tier: 2,
    };

    if (mappedType === "owns_pct") {
      edge.value = undefined;
    }

    edges.push(edge);

    sourceRecords.push({
      record_id: "icij-src-" + rel.node_id_start + "-" + rel.node_id_end,
      dataset: "registry",
      raw: rel as unknown as Record<string, unknown>,
      url_or_ref: "https://offshoreleaks.icij.org/search?q=" + rel.node_id_start,
      observed_date: rel.start_date || undefined,
    });

    edgeIdx++;
  }

  console.log(`ICIJ: ${entities.length} entities, ${edges.length} edges, ${sourceRecords.length} source records`);
  return { entities, edges, sourceRecords };
}
