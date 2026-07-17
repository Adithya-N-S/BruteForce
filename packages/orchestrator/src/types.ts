import type { EvidenceEdge, AdjudicatorVerdict, Dossier } from '@bruteforce/core';

export interface InvestigationSession {
  id: string;
  target: string;
  targetEntityId: string | null;
  uboEntityId: string | null;
  graphEdges: EvidenceEdge[];
  steps: number;
  maxSteps: number;
  status: 'running' | 'pierced' | 'exhausted' | 'error';
  verdict: AdjudicatorVerdict | null;
  dossier: Dossier | null;
  narrative: string | null;
  createdAt: string;
  error?: string;
}

export interface SSEClient {
  id: string;
  send(event: string, data: unknown): void;
  close(): void;
}

export interface PlannerAction {
  tool: string;
  args: Record<string, unknown>;
}

export interface PlannerResponse {
  action: PlannerAction | { stop: true; reason: string };
  rationale: string;
}
