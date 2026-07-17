const EDGE_TYPE_MAP = {
    director: 'director_of',
    address: 'registered_at',
    agent: 'agent_for',
};
const REVERSE_TYPE_MAP = {
    director_of: 'director',
    registered_at: 'address',
    agent_for: 'agent',
};
export function findSharedAttributes(graph, params) {
    const targetEdgeTypes = params.attribute
        ? (() => { const t = EDGE_TYPE_MAP[params.attribute]; return t ? [t] : []; })()
        : ['director_of', 'registered_at', 'agent_for'];
    const allEntityEdges = graph.getAllEdges(params.entity_id);
    const matchingEdges = allEntityEdges.filter(e => targetEdgeTypes.includes(e.type));
    const seenKeys = new Set();
    const links = [];
    for (const edge of matchingEdges) {
        const sharedNodeId = edge.from === params.entity_id ? edge.to : edge.from;
        const edgeType = edge.type;
        const sharedNode = graph.getEntity(sharedNodeId);
        if (!sharedNode)
            continue;
        const sharedNodeEdges = graph.getAllEdges(sharedNodeId);
        const sameTypeEdges = sharedNodeEdges.filter(e => e.type === edgeType);
        for (const se of sameTypeEdges) {
            const linkedId = se.from === sharedNodeId ? se.to : se.from;
            if (linkedId === params.entity_id || linkedId === sharedNodeId)
                continue;
            const dedupKey = linkedId + '|' + REVERSE_TYPE_MAP[edgeType] + '|' + sharedNodeId;
            if (seenKeys.has(dedupKey))
                continue;
            seenKeys.add(dedupKey);
            const collectedEdges = [edge, se];
            const uniqueEdges = new Map();
            for (const ce of collectedEdges) {
                uniqueEdges.set(ce.id, ce);
            }
            links.push({
                linked_entity_id: linkedId,
                shared_attribute_type: REVERSE_TYPE_MAP[edgeType] || edgeType,
                shared_attribute_value: sharedNode.name,
                edges: Array.from(uniqueEdges.values()),
            });
        }
    }
    return { links };
}
//# sourceMappingURL=find-shared-attributes.js.map