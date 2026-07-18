import type { InvestigationSession, SSEClient } from './types.js';
export declare function runInvestigation(target: string, sseClients: SSEClient[]): Promise<InvestigationSession>;
