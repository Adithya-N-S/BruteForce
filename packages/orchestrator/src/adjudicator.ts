import type { AdjudicatorVerdict, EvidenceEdge } from '@bruteforce/core';

export function adjudicate(params: {
  effectiveControl: number;
  sanctionsHit: boolean;
  edges: EvidenceEdge[];
}): AdjudicatorVerdict {
  const threshold = 0.25;
  const minConfidence = params.edges.length > 0
    ? Math.min(...params.edges.map(e => e.confidence ?? 1))
    : 0;

  const weakestLink = params.edges.length > 0
    ? params.edges.reduce((min, e) => ((e.confidence ?? 1) < (min.confidence ?? 1) ? e : min))
    : null;

  const pierced = params.effectiveControl >= threshold
    && params.sanctionsHit
    && minConfidence >= 0.5;

  return {
    pierced,
    effective_control: params.effectiveControl,
    overall_confidence: minConfidence,
    weakest_link: weakestLink,
  };
}
