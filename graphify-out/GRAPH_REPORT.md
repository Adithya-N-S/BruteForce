# Graph Report - BruteForce  (2026-07-17)

## Corpus Check
- 18 files · ~141,885 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 104 nodes · 129 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `SAR Summary` - 10 edges
2. `The Tool Menu` - 9 edges
3. `compilerOptions` - 8 edges
4. `EntityNode` - 7 edges
5. `SourceRecord` - 7 edges
6. `Output Structure` - 7 edges
7. `EvidenceEdge` - 6 edges
8. `parseICIJ()` - 5 edges
9. `main()` - 5 edges
10. `Few-Shot Examples` - 5 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `parseICIJ()`  [EXTRACTED]
  packages/data/ingest/run.ts → packages/data/ingest/parse-icij.ts
- `main()` --calls--> `parseOpenSanctions()`  [EXTRACTED]
  packages/data/ingest/run.ts → packages/data/ingest/parse-opensanctions.ts
- `main()` --calls--> `getPlantedCase()`  [EXTRACTED]
  packages/data/ingest/run.ts → packages/data/ingest/planted-case.ts
- `main()` --calls--> `getSyntheticTrade()`  [EXTRACTED]
  packages/data/ingest/run.ts → packages/data/ingest/synthetic-trade.ts

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.22
Nodes (13): getPlantedCase(), plantedEdges, plantedEntities, plantedSourceRecords, main(), getSyntheticTrade(), shipments, EntityNode (+5 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (12): Alternative Connections, Conclusion, Evidence Quality, Executive Summary, Few-Shot Example, Hard Constraints, Input You Receive, Output Structure (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (11): dependencies, csv-parse, tsx, typescript, name, private, scripts, download (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (10): Case Information, Conclusion, Evidence Quality, Narrative, Ownership Structure, Sanctions Match, SAR Summary, Source Records (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, strict, target (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.28
Nodes (8): ICIJAddressRow, ICIJEntityRow, ICIJOfficerRow, ICIJRelationshipRow, mapRelType(), parseICIJ(), readCSV(), TARGET_JURISDICTIONS

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (8): Bad output (do NOT do this):, Few-Shot Examples, Good output (after finding candidate UBO):, Good output (starting a case):, Good output (stopping):, Hard Constraints, Strategy Guidelines, Your Role

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): all_control_paths, assemble_dossier, co_consignee_links, compute_control, find_shared_attributes, match_sanctions, resolve_entity, score_evidence (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.40
Nodes (4): createMinimalSanctions(), parseOpenSanctions(), PRIORITY_DATASETS, SanctionsRow

### Community 9 - "Community 9"
Cohesion: 0.50
Nodes (3): name, private, workspaces

## Knowledge Gaps
- **68 isolated node(s):** `name`, `private`, `workspaces`, `download.sh script`, `ICIJEntityRow` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `The Tool Menu` connect `Community 7` to `Community 6`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `EntityNode` connect `Community 0` to `Community 8`, `Community 5`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._