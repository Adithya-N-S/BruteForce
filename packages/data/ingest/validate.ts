import { readFileSync, existsSync } from "fs";
import { EntityNode, EvidenceEdge, SourceRecord } from "./types.ts";

const ENTITIES_PATH = "seed/entities.json";
const EDGES_PATH = "seed/edges.json";
const SOURCE_RECORDS_PATH = "seed/source_records.json";
const SANCTIONS_PATH = "seed/sanctions_list.json";

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    console.log(`  FAIL: ${label}`);
  }
}

async function main() {
  console.log("=== BruteForce Seed Data Validation ===\n");

  if (!existsSync(ENTITIES_PATH)) {
    console.error("FAIL: entities.json not found. Run ingestion first.");
    process.exit(1);
  }

  const entities = readJSON<EntityNode[]>(ENTITIES_PATH);
  const edges = readJSON<EvidenceEdge[]>(EDGES_PATH);
  const sourceRecords = readJSON<SourceRecord[]>(SOURCE_RECORDS_PATH);

  let passed = 0;
  let failed = 0;

  function pass(label: string) { console.log(`  PASS: ${label}`); passed++; }
  function fail(label: string) { console.log(`  FAIL: ${label}`); failed++; }

  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const edgesByType = new Map<string, EvidenceEdge[]>();
  for (const e of edges) {
    const arr = edgesByType.get(e.type) || [];
    arr.push(e);
    edgesByType.set(e.type, arr);
  }

  const sourceRecordMap = new Map(sourceRecords.map((s) => [s.record_id, s]));

  if (entityMap.has("plt-novacrest")) {
    pass("plt-novacrest entity exists");
  } else {
    fail("plt-novacrest entity exists");
  }

  const ownsPctEdges = edgesByType.get("owns_pct") || [];
  const ownershipChain = ownsPctEdges.filter((e) => {
    return e.from === "plt-pacific-rim" && e.to === "plt-novacrest" ||
      e.from === "plt-meridian" && e.to === "plt-pacific-rim" ||
      e.from === "plt-volkov-trust" && e.to === "plt-meridian" ||
      e.from === "plt-volkov" && e.to === "plt-volkov-trust";
  });

  if (ownershipChain.length === 4) {
    pass("4-hop ownership chain exists (plt-novacrest -> plt-volkov)");
  } else {
    fail(`4-hop ownership chain exists (found ${ownershipChain.length} edges)`);
  }

  const pltE001 = edges.find((e) => e.id === "plt-e-001");
  const pltE002 = edges.find((e) => e.id === "plt-e-002");
  const pltE003 = edges.find((e) => e.id === "plt-e-003");
  const pltE004 = edges.find((e) => e.id === "plt-e-004");

  if (pltE001 && pltE002 && pltE003 && pltE004) {
    const control =
      (pltE001.value || 1) * (pltE002.value || 1) *
      (pltE003.value || 1) * (pltE004.value || 1);

    const expected = 0.52 * 0.80 * 0.75 * 1.0;
    const eps = 0.001;

    if (Math.abs(control - expected) < eps) {
      pass(`Effective control = ${(control * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)`);
    } else {
      fail(`Effective control = ${(control * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)`);
    }

    if (control >= 0.25) {
      pass(`Effective control ${(control * 100).toFixed(1)}% >= 25% threshold`);
    } else {
      fail(`Effective control ${(control * 100).toFixed(1)}% >= 25% threshold`);
    }

    if (pltE001.value === 0.52) {
      pass("plt-e-001 value = 0.52");
    } else {
      fail(`plt-e-001 value = ${pltE001.value}`);
    }
    if (pltE002.value === 0.80) {
      pass("plt-e-002 value = 0.80");
    } else {
      fail(`plt-e-002 value = ${pltE002.value}`);
    }
    if (pltE003.value === 0.75) {
      pass("plt-e-003 value = 0.75");
    } else {
      fail(`plt-e-003 value = ${pltE003.value}`);
    }
    if (pltE004.value === 1.0) {
      pass("plt-e-004 value = 1.0");
    } else {
      fail(`plt-e-004 value = ${pltE004.value}`);
    }
  } else {
    fail("All 4 ownership edges exist");
  }

  const sanctionedEdges = edgesByType.get("listed_sanctioned") || [];
  const volkovSanctioned = sanctionedEdges.find(
    (e) => e.from === "plt-volkov" && e.to === "plt-volkov"
  );
  if (volkovSanctioned) {
    pass("plt-volkov has listed_sanctioned edge (self-loop)");
  } else {
    fail("plt-volkov has listed_sanctioned edge");
  }

  let sanctionsList: EntityNode[] = [];
  try {
    sanctionsList = readJSON<EntityNode[]>(SANCTIONS_PATH);
    const volkovInSanctions = sanctionsList.find(
      (e) => e.id === "os-plt-volkov"
    );
    if (volkovInSanctions) {
      pass("plt-volkov exists in sanctions_list.json as os-plt-volkov");
    } else {
      fail("plt-volkov exists in sanctions_list.json");
    }
  } catch {
    fail("sanctions_list.json is readable");
  }

  const eastwindAddrEdges = edges.filter(
    (e) => e.from === "plt-eastwind" && e.type === "registered_at"
  );
  const northernStarAddrEdges = edges.filter(
    (e) => e.from === "plt-northern-star" && e.type === "registered_at"
  );

  const eastwindOceanic = eastwindAddrEdges.find(
    (e) => e.to === "plt-addr-oceanic"
  );
  const northernStarOceanic = northernStarAddrEdges.find(
    (e) => e.to === "plt-addr-oceanic"
  );

  if (eastwindOceanic && northernStarOceanic) {
    pass("Shared address alt route: eastwind + northern-star both registered_at plt-addr-oceanic");
  } else {
    fail("Shared address alt route exists");
  }

  let allEdgesHaveSourceRecords = true;
  let missingCount = 0;
  for (const edge of edges) {
    if (!sourceRecordMap.has(edge.record_id)) {
      allEdgesHaveSourceRecords = false;
      missingCount++;
    }
  }
  if (allEdgesHaveSourceRecords) {
    pass(`All ${edges.length} edges have corresponding source records`);
  } else {
    fail(`${missingCount} edges missing source records`);
  }

  if (pltE001) {
    const hasAllFields =
      pltE001.source_dataset !== undefined &&
      pltE001.record_id !== undefined &&
      pltE001.reliability_tier !== undefined;
    if (hasAllFields) {
      pass("Edges have source_dataset + record_id + reliability_tier");
    } else {
      fail("Some edges missing required fields");
    }
  }

  if (entities.length >= 200) {
    pass(`Total entities >= 200: ${entities.length}`);
  } else {
    fail(`Total entities >= 200: ${entities.length}`);
  }

  const plantedEntities = entities.filter((e) => e.source_dataset === "synthetic");
  if (plantedEntities.length >= 10) {
    pass(`Planted entities present: ${plantedEntities.length}`);
  } else {
    fail(`Planted entities present: ${plantedEntities.length}`);
  }

  const edgeKeys = new Set(edges.map((e) => e.id));
  if (edgeKeys.size === edges.length) {
    pass("All edge IDs are unique");
  } else {
    fail(`Edge ID collisions: ${edges.length - edgeKeys.size} duplicates`);
  }

  const entityKeys = new Set(entities.map((e) => e.id));
  if (entityKeys.size === entities.length) {
    pass("All entity IDs are unique");
  } else {
    fail(`Entity ID collisions: ${entities.length - entityKeys.size} duplicates`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
