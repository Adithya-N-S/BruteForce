# Graph Report - BruteForce  (2026-07-17)

## Corpus Check
- 48 files · ~155,587 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 272 nodes · 471 edges · 24 communities (23 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a4277c98`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `GraphManager` - 25 edges
2. `compilerOptions` - 20 edges
3. `EvidenceEdge` - 19 edges
4. `EntityId` - 15 edges
5. `SAR Summary` - 10 edges
6. `resolveEntity()` - 9 edges
7. `normalizeString()` - 9 edges
8. `The Tool Menu` - 9 edges
9. `EntityNode` - 8 edges
10. `isNormalizedExactMatch()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `ComputeControlOutput` --references--> `ControlPath`  [EXTRACTED]
  packages/core/src/algorithms/compute-control.ts → packages/core/src/types.ts
- `SharedAttributeLink` --references--> `EntityId`  [EXTRACTED]
  packages/core/src/algorithms/find-shared-attributes.ts → packages/core/src/types.ts
- `ControlPathResult` --references--> `EvidenceEdge`  [EXTRACTED]
  packages/core/src/algorithms/all-control-paths.ts → packages/core/src/types.ts
- `assembleDossier()` --calls--> `allControlPaths()`  [EXTRACTED]
  packages/core/src/algorithms/assemble-dossier.ts → packages/core/src/algorithms/all-control-paths.ts
- `assembleDossier()` --calls--> `computeControl()`  [EXTRACTED]
  packages/core/src/algorithms/assemble-dossier.ts → packages/core/src/algorithms/compute-control.ts

## Import Cycles
- None detected.

## Communities (24 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (25): ICIJAddressRow, ICIJEntityRow, ICIJOfficerRow, ICIJRelationshipRow, mapRelType(), parseICIJ(), readCSV(), TARGET_JURISDICTIONS (+17 more)

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
Cohesion: 0.17
Nodes (20): allControlPaths(), ControlPathResult, assembleDossier(), coConsigneeLinks(), TRADE_EDGE_TYPES, computeControl(), ComputeControlOutput, getPathString() (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (17): all_control_paths, assemble_dossier, Bad output (do NOT do this):, co_consignee_links, compute_control, Few-Shot Examples, find_shared_attributes, Good output (after finding candidate UBO): (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (21): buildExplanation(), classifyConfidence(), extractAddress(), extractIdentifiers(), FIELD_WEIGHTS, FieldScore, isAmbiguous(), resolveEntity() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (24): dependencies, graphology, graphology-types, description, devDependencies, rimraf, typescript, vitest (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.50
Nodes (3): name, private, workspaces

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (3): GraphManager, EntityId, EntityNode

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (18): AdjudicatorVerdict, AuditEntry, ComputeControlResult, ControlPath, Dossier, EntityType, EvidenceConfidence, EvidenceDataset (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (7): DuplicateEdgeError, DuplicateEntityError, EdgeNotFoundError, EntityNotFoundError, GraphError, EdgeAttributes, NodeAttributes

## Knowledge Gaps
- **116 isolated node(s):** `name`, `private`, `workspaces`, `name`, `version` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GraphManager` connect `Community 12` to `Community 5`, `Community 14`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `EvidenceEdge` connect `Community 5` to `Community 12`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `EntityNode` connect `Community 12` to `Community 13`, `Community 14`, `Community 7`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 8` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._