import type { MatchSanctionsResult } from '../types.js';
export interface MatchSanctionsOptions {
    threshold?: number;
}
export declare function matchSanctions(entityName: string, sanctionsList: unknown[], options?: MatchSanctionsOptions): MatchSanctionsResult;
//# sourceMappingURL=match-sanctions.d.ts.map