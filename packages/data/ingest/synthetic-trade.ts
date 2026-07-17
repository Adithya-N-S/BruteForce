import { EntityNode, EvidenceEdge, SourceRecord } from "./types.ts";

const shipments = [
  { name: "MV Ocean Trader", imo: "IMO-1000001" },
  { name: "MV Blue Horizon", imo: "IMO-1000002" },
  { name: "MV Golden Phoenix", imo: "IMO-1000003" },
  { name: "MV Nordic Star", imo: "IMO-1000004" },
  { name: "MV Southern Cross", imo: "IMO-1000005" },
  { name: "MV Crimson Tide", imo: "IMO-1000006" },
  { name: "MV Arctic Dawn", imo: "IMO-1000007" },
  { name: "MV Pacific Voyager", imo: "IMO-1000008" },
  { name: "MV Silver Crest", imo: "IMO-1000009" },
  { name: "MV Desert Rose", imo: "IMO-1000010" },
  { name: "MV Highland Queen", imo: "IMO-1000011" },
  { name: "MV Starlight Express", imo: "IMO-1000012" },
  { name: "MV Thunder Bay", imo: "IMO-1000013" },
  { name: "MV Morning Star", imo: "IMO-1000014" },
  { name: "MV Emerald Sea", imo: "IMO-1000015" },
  { name: "MV Crystal Waters", imo: "IMO-1000016" },
  { name: "MV Royal Duchess", imo: "IMO-1000017" },
  { name: "MV Iron Clad", imo: "IMO-1000018" },
  { name: "MV Golden Eagle", imo: "IMO-1000019" },
  { name: "MV Sapphire Ray", imo: "IMO-1000020" },
];

export function getSyntheticTrade(): {
  entities: EntityNode[];
  edges: EvidenceEdge[];
  sourceRecords: SourceRecord[];
} {
  const entities: EntityNode[] = [];
  const edges: EvidenceEdge[] = [];
  const sourceRecords: SourceRecord[] = [];

  for (const ship of shipments) {
    entities.push({
      id: "trade-vessel-" + ship.imo,
      type: "vessel",
      name: ship.name,
      jurisdiction: "HK",
      attributes: { imo_no: ship.imo, vessel_type: "Container Ship" },
      source_dataset: "trade",
    });

    sourceRecords.push({
      record_id: "trade-src-" + ship.imo,
      dataset: "trade",
      raw: {
        vessel: ship.name,
        imo: ship.imo,
        flag: "Hong Kong",
        year_built: 2018 + Math.floor(Math.random() * 5),
      },
      url_or_ref: "https://www.marinetraffic.com/ vessels/" + ship.imo,
      observed_date: "2024-01-15",
    });
  }

  const pltTradeEdges: EvidenceEdge[] = [
    {
      id: "trade-e-000",
      from: "plt-novacrest",
      to: "trade-vessel-IMO-1000001",
      type: "consignee_on",
      source_dataset: "trade",
      record_id: "trade-src-IMO-1000001",
      observed_date: "2024-02-14",
      extraction_method: "bill_of_lading_field",
      reliability_tier: 3,
    },
    {
      id: "trade-e-001",
      from: "plt-eastwind",
      to: "trade-vessel-IMO-1000001",
      type: "shipper_on",
      source_dataset: "trade",
      record_id: "trade-src-IMO-1000001",
      observed_date: "2024-02-14",
      extraction_method: "bill_of_lading_field",
      reliability_tier: 3,
    },
    {
      id: "trade-e-002",
      from: "plt-northern-star",
      to: "trade-vessel-IMO-1000002",
      type: "consignee_on",
      source_dataset: "trade",
      record_id: "trade-src-IMO-1000002",
      observed_date: "2024-03-01",
      extraction_method: "bill_of_lading_field",
      reliability_tier: 3,
    },
  ];

  edges.push(...pltTradeEdges);

  const icijEntityPrefixes = ["icij-ent-", "icij-off-"];
  const allEntityIds = entities.map((e) => e.id);

  for (let i = 3; i < 20; i++) {
    const vessel = shipments[i];
    const srcEntity = "plt-novacrest";
    const tgtEntity = "trade-vessel-" + vessel.imo;

    const relType: "consignee_on" | "shipper_on" = i % 2 === 0 ? "consignee_on" : "shipper_on";

    edges.push({
      id: "trade-e-" + String(i).padStart(3, "0"),
      from: srcEntity,
      to: tgtEntity,
      type: relType,
      source_dataset: "trade",
      record_id: "trade-src-" + vessel.imo,
      observed_date: "2024-0" + ((i % 9) + 1) + "-15",
      extraction_method: "bill_of_lading_field",
      reliability_tier: 3,
    });
  }

  console.log(`Synthetic trade: ${entities.length} vessel entities, ${edges.length} trade edges`);
  return { entities, edges, sourceRecords };
}
