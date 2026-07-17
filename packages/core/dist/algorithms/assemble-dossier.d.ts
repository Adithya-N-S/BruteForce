import type { EntityId, Dossier, MatchSanctionsResult } from '../types.js';
import type { GraphManager } from '../graph/graph-manager.js';
export declare function assembleDossier(graph: GraphManager, params: {
    root: EntityId;
    target: EntityId;
}, sanctionMatches?: MatchSanctionsResult): Dossier;
//# sourceMappingURL=assemble-dossier.d.ts.map