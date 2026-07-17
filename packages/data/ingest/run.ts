import { writeFileSync, mkdirSync } from "fs";
import { getPlantedCase } from "./planted-case.ts";
import { parseOpenSanctions } from "./parse-opensanctions.ts";
import { parseICIJ } from "./parse-icij.ts";
import { getSyntheticTrade } from "./synthetic-trade.ts";
import { EntityNode, EvidenceEdge, SourceRecord } from "./types.ts";

async function main() {
  console.log("=== BruteForce Data Ingestion ===\n");

  const planted = getPlantedCase();
  console.log(`Planted case: ${planted.entities.length} entities, ${planted.edges.length} edges`);

  const sanctions = await parseOpenSanctions();
  const icij = await parseICIJ();
  const trade = getSyntheticTrade();

  const allEntities: EntityNode[] = [
    ...planted.entities,
    ...sanctions.entities,
    ...icij.entities,
    ...trade.entities,
  ];

  const allEdges: EvidenceEdge[] = [
    ...planted.edges,
    ...icij.edges,
    ...trade.edges,
  ];

  const allSourceRecords: SourceRecord[] = [
    ...planted.sourceRecords,
    ...sanctions.sourceRecords,
    ...icij.sourceRecords,
    ...trade.sourceRecords,
  ];

  mkdirSync("seed", { recursive: true });

  writeFileSync("seed/entities.json", JSON.stringify(allEntities, null, 2));
  writeFileSync("seed/edges.json", JSON.stringify(allEdges, null, 2));
  writeFileSync("seed/source_records.json", JSON.stringify(allSourceRecords, null, 2));
  writeFileSync("seed/sanctions_list.json", JSON.stringify(sanctions.entities, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Entities: ${allEntities.length}`);
  console.log(`Edges: ${allEdges.length}`);
  console.log(`Source records: ${allSourceRecords.length}`);
  console.log(`Sanctions entries: ${sanctions.entities.length}`);
  console.log("\nOutput written to seed/");
}

main().catch(console.error);
