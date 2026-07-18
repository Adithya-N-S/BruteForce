/**
 * @module algorithms/find-shared-attributes
 * @description
 * Deterministic algorithm to identify attributes shared between entities.
 *
 * This algorithm supports two modes:
 * 1. Scanning a list of nodes and edges to find groups of entities sharing attributes (new).
 * 2. Finding shared attribute links for a specific entity in a GraphManager (backward compatibility).
 */
import { normalizeString, normalizeEntityName } from '../utils/index.js';
/**
 * Maps edge types to original attribute names for backward compatibility.
 */
const EDGE_TYPE_MAP = {
    director: 'director_of',
    address: 'registered_at',
    agent: 'agent_for',
};
/**
 * Maps edge types in reverse for backward compatibility.
 */
const REVERSE_TYPE_MAP = {
    director_of: 'director',
    registered_at: 'address',
    agent_for: 'agent',
};
/**
 * Deterministic weights representing the uniqueness/strength of each attribute type.
 * Higher values contribute more to the overall match confidence.
 */
const CONFIDENCE_WEIGHTS = {
    registration_number: 0.95,
    tax_id: 0.95,
    email: 0.85,
    phone: 0.80,
    domain: 0.75,
    director: 0.70,
    address: 0.60,
    jurisdiction: 0.05,
    other: 0.30,
};
/**
 * Normalizes a phone number by keeping only digits and '+'.
 * Returns null if the normalized value is too short to be unique.
 *
 * @param value - The raw phone number string or number.
 * @returns Normalized phone string or null.
 */
function normalizePhone(value) {
    const str = String(value);
    const normalized = str.replace(/[^\d+]/g, '');
    return normalized.length >= 5 ? normalized : null;
}
/**
 * Normalizes an email address by trimming and converting to lowercase.
 * Returns null if the value does not resemble an email address.
 *
 * @param value - The raw email address string.
 * @returns Normalized email string or null.
 */
function normalizeEmail(value) {
    const normalized = value.trim().toLowerCase();
    return normalized.includes('@') ? normalized : null;
}
/**
 * Normalizes a domain/website URL by trimming, converting to lowercase,
 * and removing schemes/subdomains.
 *
 * @param value - The raw domain or website string.
 * @returns Normalized domain string or null.
 */
function normalizeDomain(value) {
    let normalized = value.trim().toLowerCase();
    normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
    normalized = (normalized.split('/')[0] ?? '').split('?')[0] ?? '';
    return normalized.length > 0 ? normalized : null;
}
/**
 * Normalizes alphanumeric identifiers (e.g. registration/tax IDs) by
 * trimming, lowercase, and removing non-alphanumeric characters.
 * Returns null if the value is too short to be unique.
 *
 * @param value - The raw identifier string or number.
 * @returns Normalized identifier string or null.
 */
function normalizeId(value) {
    const str = String(value);
    const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized.length >= 3 ? normalized : null;
}
/**
 * Normalizes a person's name using entity name normalization rules.
 *
 * @param value - The raw name string.
 * @returns Normalized name string or null.
 */
function normalizeName(value) {
    const normalized = normalizeEntityName(value);
    return normalized.length > 0 ? normalized : null;
}
/**
 * Normalizes an address string using standard string normalization.
 *
 * @param value - The raw address string.
 * @returns Normalized address string or null.
 */
function normalizeAddr(value) {
    const normalized = normalizeString(value);
    return normalized.length > 0 ? normalized : null;
}
/**
 * Extracts all attributes from an EntityNode based on its jurisdiction,
 * properties, attributes bag, and node type.
 *
 * @param node - The entity node.
 * @returns List of extracted attributes.
 */
function extractNodeAttributes(node) {
    const list = [];
    const add = (type, val) => {
        const original = String(val).trim();
        if (!original)
            return;
        let normalized = null;
        switch (type) {
            case 'phone':
                normalized = normalizePhone(original);
                break;
            case 'email':
                normalized = normalizeEmail(original);
                break;
            case 'domain':
                normalized = normalizeDomain(original);
                break;
            case 'registration_number':
            case 'tax_id':
                normalized = normalizeId(original);
                break;
            case 'address':
                normalized = normalizeAddr(original);
                break;
            case 'director':
                normalized = normalizeName(original);
                break;
            case 'jurisdiction':
                normalized = original.toUpperCase().trim() || null;
                break;
            default:
                normalized = normalizeString(original);
        }
        if (normalized) {
            list.push({ type, normalized, original });
        }
    };
    // 1. Jurisdiction
    if (node.jurisdiction && node.jurisdiction.trim().length > 0) {
        add('jurisdiction', node.jurisdiction);
    }
    // 2. Attributes Bag
    for (const [key, value] of Object.entries(node.attributes)) {
        const values = [];
        if (typeof value === 'string' || typeof value === 'number') {
            values.push(value);
        }
        else if (Array.isArray(value)) {
            for (const val of value) {
                if (typeof val === 'string' || typeof val === 'number') {
                    values.push(val);
                }
            }
        }
        if (values.length === 0)
            continue;
        let type = 'other';
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('address') || lowerKey.includes('street') || lowerKey.includes('location') || lowerKey.includes('hq')) {
            type = 'address';
        }
        else if (lowerKey.includes('email') || lowerKey.includes('e_mail')) {
            type = 'email';
        }
        else if (lowerKey.includes('phone') || lowerKey.includes('tel') || lowerKey.includes('mobile') || lowerKey.includes('fax')) {
            type = 'phone';
        }
        else if (lowerKey.includes('tax_id') || lowerKey.includes('tax_identifier') || lowerKey.includes('tin') || lowerKey.includes('tax_number') || lowerKey.includes('vat')) {
            type = 'tax_id';
        }
        else if (lowerKey.includes('registration_number') || lowerKey.includes('reg_num') || lowerKey.includes('reg_number') || lowerKey.includes('company_number') || lowerKey.includes('inc_number') || lowerKey.endsWith('_number') || lowerKey.endsWith('_id')) {
            type = 'registration_number';
        }
        else if (lowerKey.includes('domain') || lowerKey.includes('website') || lowerKey.includes('web_site') || lowerKey.includes('url')) {
            type = 'domain';
        }
        else if (lowerKey.includes('director') || lowerKey.includes('officer') || lowerKey.includes('ubo') || lowerKey.includes('owner') || lowerKey.includes('shareholder')) {
            type = 'director';
        }
        for (const val of values) {
            add(type, val);
        }
    }
    // 3. Node Type Specific overrides
    if (node.type === 'address') {
        add('address', node.name);
    }
    if (node.type === 'person') {
        add('director', node.name);
    }
    return list;
}
/**
 * Internal implementation of finding shared attributes from lists of nodes and edges.
 */
function findSharedAttributesList(nodes, edges) {
    const nodeMap = new Map();
    for (const node of nodes) {
        nodeMap.set(node.id, node);
    }
    const entityAttributes = new Map();
    // Extract attributes from node fields and bags
    for (const node of nodes) {
        entityAttributes.set(node.id, extractNodeAttributes(node));
    }
    // Extract attributes derived from edges
    for (const edge of edges) {
        const fromNode = nodeMap.get(edge.from);
        const toNode = nodeMap.get(edge.to);
        if (edge.type === 'director_of') {
            const companyId = edge.to;
            const companyAttrs = entityAttributes.get(companyId) || [];
            if (fromNode) {
                const normName = normalizeName(fromNode.name);
                if (normName) {
                    companyAttrs.push({ type: 'director', normalized: normName, original: fromNode.name });
                }
            }
            companyAttrs.push({ type: 'director', normalized: edge.from.toLowerCase(), original: edge.from });
            entityAttributes.set(companyId, companyAttrs);
        }
        if (edge.type === 'registered_at') {
            const companyId = edge.from;
            const companyAttrs = entityAttributes.get(companyId) || [];
            if (toNode) {
                const normAddr = normalizeAddr(toNode.name);
                if (normAddr) {
                    companyAttrs.push({ type: 'address', normalized: normAddr, original: toNode.name });
                }
            }
            companyAttrs.push({ type: 'address', normalized: edge.to.toLowerCase(), original: edge.to });
            entityAttributes.set(companyId, companyAttrs);
        }
        if (edge.type === 'agent_for') {
            const companyId = edge.to;
            const companyAttrs = entityAttributes.get(companyId) || [];
            if (fromNode) {
                const normName = normalizeName(fromNode.name);
                if (normName) {
                    companyAttrs.push({ type: 'other', normalized: normName, original: fromNode.name });
                }
            }
            companyAttrs.push({ type: 'other', normalized: edge.from.toLowerCase(), original: edge.from });
            entityAttributes.set(companyId, companyAttrs);
        }
    }
    // Deduplicate attributes for each individual entity
    for (const [entityId, attrs] of entityAttributes.entries()) {
        const seen = new Set();
        const deduped = [];
        for (const attr of attrs) {
            const key = `${attr.type}:${attr.normalized}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(attr);
            }
        }
        entityAttributes.set(entityId, deduped);
    }
    // Map each unique attribute to the entities that possess it
    const attributeToEntities = new Map();
    const attributeDetails = new Map();
    for (const [entityId, attrs] of entityAttributes.entries()) {
        for (const attr of attrs) {
            const key = `${attr.type}:${attr.normalized}`;
            if (!attributeToEntities.has(key)) {
                attributeToEntities.set(key, new Set());
                attributeDetails.set(key, attr);
            }
            attributeToEntities.get(key).add(entityId);
        }
    }
    const groupedMatches = new Map();
    for (const [key, entitiesSet] of attributeToEntities.entries()) {
        if (entitiesSet.size < 2)
            continue;
        const sortedEntities = Array.from(entitiesSet).sort();
        const groupKey = sortedEntities.join(',');
        const attrDetail = attributeDetails.get(key);
        if (!groupedMatches.has(groupKey)) {
            groupedMatches.set(groupKey, {
                entities: sortedEntities,
                attributes: []
            });
        }
        groupedMatches.get(groupKey).attributes.push(attrDetail);
    }
    // Construct match results
    const matches = [];
    for (const group of groupedMatches.values()) {
        const sharedAttributes = group.attributes.map(attr => ({
            type: attr.type,
            value: attr.normalized,
            originalValue: attr.original
        }));
        const matchedFields = Array.from(new Set(group.attributes.map(attr => attr.type))).sort();
        // Probabilistic union: 1 - product(1 - weight_i)
        let product = 1;
        for (const attr of sharedAttributes) {
            const weight = CONFIDENCE_WEIGHTS[attr.type] ?? CONFIDENCE_WEIGHTS['other'] ?? 0.30;
            product *= (1 - weight);
        }
        const confidenceContribution = 1 - product;
        matches.push({
            sharedAttributes,
            matchedEntities: group.entities,
            matchedFields,
            confidenceContribution
        });
    }
    // Sort matches descending by confidenceContribution, then by group size
    const sortedMatches = matches.sort((a, b) => {
        if (Math.abs(a.confidenceContribution - b.confidenceContribution) > 1e-9) {
            return b.confidenceContribution - a.confidenceContribution;
        }
        return b.matchedEntities.length - a.matchedEntities.length;
    });
    return { matches: sortedMatches };
}
/**
 * Original findSharedAttributes implementation for backward compatibility.
 */
function findSharedAttributesGraph(graph, params) {
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
export function findSharedAttributes(arg1, arg2) {
    if (Array.isArray(arg1)) {
        return findSharedAttributesList(arg1, arg2 || []);
    }
    else {
        return findSharedAttributesGraph(arg1, arg2);
    }
}
//# sourceMappingURL=find-shared-attributes.js.map