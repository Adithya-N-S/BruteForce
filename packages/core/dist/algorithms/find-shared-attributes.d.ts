import type { EntityId, EvidenceEdge } from '../types.js';
import type { GraphManager } from '../graph/graph-manager.js';
export interface SharedAttributeLink {
    readonly linked_entity_id: EntityId;
    readonly shared_attribute_type: string;
    readonly shared_attribute_value: string;
    readonly edges: readonly EvidenceEdge[];
}
export declare function findSharedAttributes(graph: GraphManager, params: {
    entity_id: EntityId;
    attribute?: 'director' | 'address' | 'agent' | 'phone';
}): {
    links: SharedAttributeLink[];
};
//# sourceMappingURL=find-shared-attributes.d.ts.map