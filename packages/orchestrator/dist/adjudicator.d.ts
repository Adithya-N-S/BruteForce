import type { AdjudicatorVerdict, EvidenceEdge } from '@bruteforce/core';
export declare function adjudicate(params: {
    effectiveControl: number;
    sanctionsHit: boolean;
    edges: EvidenceEdge[];
}): AdjudicatorVerdict;
