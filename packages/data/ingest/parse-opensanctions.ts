import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { EntityNode, SourceRecord } from "./types.ts";

const SANCTIONS_PATH = "raw/sanctions.csv";

interface SanctionsRow {
  id: string;
  schema: string;
  name: string;
  aliases: string;
  birth_date: string;
  countries: string;
  addresses: string;
  identifiers: string;
  sanctions: string;
  phones: string;
  emails: string;
  program_ids: string;
  dataset: string;
  first_seen: string;
  last_seen: string;
  last_change: string;
}

const PRIORITY_DATASETS = new Set([
  "us_ofac_sdn",
  "eu_sanctions",
  "un_sc_sanctions",
]);

function scorePriority(row: SanctionsRow): number {
  const datasets = row.dataset ? row.dataset.split(";").map((d: string) => d.trim()) : [];
  for (const ds of datasets) {
    if (PRIORITY_DATASETS.has(ds)) return 1;
  }
  return 0;
}

export async function parseOpenSanctions(): Promise<{
  entities: EntityNode[];
  sourceRecords: SourceRecord[];
}> {
  const entities: EntityNode[] = [];
  const sourceRecords: SourceRecord[] = [];

  let raw: string;
  try {
    raw = readFileSync(SANCTIONS_PATH, "utf-8");
  } catch {
    console.warn("Sanctions CSV not found, creating minimal synthetic list");
    return createMinimalSanctions();
  }

  const records: SanctionsRow[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  const filtered = records.filter(
    (r) => r.schema === "Person" || r.schema === "LegalEntity"
  );

  filtered.sort((a, b) => scorePriority(b) - scorePriority(a));

  const selected = filtered.slice(0, 500);

  for (const row of selected) {
    const entityType = row.schema === "Person" ? "person" as const : "company" as const;

    const aliasesStr = row.aliases || "";
    const sanctionsStr = row.sanctions || "";
    const countriesStr = row.countries || "";

    const attributes: Record<string, string> = {};
    if (aliasesStr) attributes.aliases = aliasesStr;
    if (sanctionsStr) attributes.sanctions_lists = sanctionsStr;
    if (row.program_ids) attributes.programs = row.program_ids;
    if (row.birth_date) attributes.birth_date = row.birth_date;

    const jurisdiction = countriesStr ? countriesStr.split(";")[0].trim().substring(0, 2) : undefined;

    const entity: EntityNode = {
      id: "os-" + row.id,
      type: entityType,
      name: row.name || "Unknown",
      jurisdiction,
      attributes,
      source_dataset: "opensanctions",
    };

    const sourceRecord: SourceRecord = {
      record_id: "os-src-" + row.id,
      dataset: "opensanctions",
      raw: row as unknown as Record<string, unknown>,
      url_or_ref: "https://opensanctions.org/entities/" + row.id,
      observed_date: row.last_seen || undefined,
    };

    entities.push(entity);
    sourceRecords.push(sourceRecord);
  }

  const volkovEntity: EntityNode = {
    id: "os-plt-volkov",
    type: "person",
    name: "Viktor Ivanovich Volkov",
    jurisdiction: "RU",
    attributes: {
      aliases: "Viktor Volkov; V.I. Volkov; Volkov Viktor Ivanovich",
      sanctions_lists: "us_ofac_sdn",
      nationality: "Russian",
    },
    source_dataset: "opensanctions",
  };

  const volkovSource: SourceRecord = {
    record_id: "os-src-plt-volkov",
    dataset: "opensanctions",
    raw: {
      id: "os-plt-volkov",
      schema: "Person",
      name: "Viktor Ivanovich Volkov",
      aliases: "Viktor Volkov; V.I. Volkov; Volkov Viktor Ivanovich",
      sanctions: "us_ofac_sdn",
      dataset: "us_ofac_sdn",
    },
    url_or_ref: "https://opensanctions.org/entities/os-plt-volkov",
    observed_date: "2022-03-01",
  };

  entities.push(volkovEntity);
  sourceRecords.push(volkovSource);

  console.log(`OpenSanctions: ${entities.length} entities, ${sourceRecords.length} source records`);
  return { entities, sourceRecords };
}

function createMinimalSanctions(): {
  entities: EntityNode[];
  sourceRecords: SourceRecord[];
} {
  const aliases = ["Viktor Volkov", "V.I. Volkov", "Volkov Viktor Ivanovich"];
  const entities: EntityNode[] = [];
  const sourceRecords: SourceRecord[] = [];

  for (let i = 0; i < 20; i++) {
    entities.push({
      id: `os-min-${i}`,
      type: i % 2 === 0 ? "person" : "company",
      name: `Synthetic Sanctions Entity ${i}`,
      attributes: { sanctions_lists: i < 5 ? "us_ofac_sdn" : "eu_sanctions" },
      source_dataset: "opensanctions",
    });
    sourceRecords.push({
      record_id: `os-src-min-${i}`,
      dataset: "opensanctions",
      raw: { synthetic: true, index: i },
      url_or_ref: "https://opensanctions.org/synthetic",
      observed_date: "2023-01-01",
    });
  }

  entities.push({
    id: "os-plt-volkov",
    type: "person",
    name: "Viktor Ivanovich Volkov",
    jurisdiction: "RU",
    attributes: {
      aliases: aliases.join("; "),
      sanctions_lists: "us_ofac_sdn",
      nationality: "Russian",
    },
    source_dataset: "opensanctions",
  });

  sourceRecords.push({
    record_id: "os-src-plt-volkov",
    dataset: "opensanctions",
    raw: {
      id: "os-plt-volkov",
      schema: "Person",
      name: "Viktor Ivanovich Volkov",
      aliases: aliases.join("; "),
      sanctions: "us_ofac_sdn",
    },
    url_or_ref: "https://opensanctions.org/entities/os-plt-volkov",
    observed_date: "2022-03-01",
  });

  console.log(`Minimal sanctions: ${entities.length} entities`);
  return { entities, sourceRecords };
}
