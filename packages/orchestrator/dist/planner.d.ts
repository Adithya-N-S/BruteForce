import type { InvestigationSession, SSEClient } from './types.js';
export declare function runInvestigation(target: string, sanctionsList: unknown[], sseClients: SSEClient[]): Promise<InvestigationSession>;
