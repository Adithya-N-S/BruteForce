const TRADE_EDGE_TYPES = new Set(['consignee_on', 'shipper_on']);
export function coConsigneeLinks(graph, params) {
    const allEdges = graph.getAllEdges(params.entity_id);
    const tradeEdges = allEdges.filter(e => TRADE_EDGE_TYPES.has(e.type));
    const shipmentIds = new Set();
    for (const edge of tradeEdges) {
        const shipmentId = edge.from === params.entity_id ? edge.to : edge.from;
        shipmentIds.add(shipmentId);
    }
    const seenEdgeIds = new Set();
    const links = [];
    for (const shipmentId of shipmentIds) {
        const shipmentEdges = graph.getAllEdges(shipmentId);
        const filtered = shipmentEdges.filter(e => TRADE_EDGE_TYPES.has(e.type) && e.from !== params.entity_id && e.to !== params.entity_id);
        for (const edge of filtered) {
            if (!seenEdgeIds.has(edge.id)) {
                seenEdgeIds.add(edge.id);
                links.push(edge);
            }
        }
    }
    return { links };
}
//# sourceMappingURL=co-consignee-links.js.map