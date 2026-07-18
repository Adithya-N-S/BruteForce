import type { InvestigationSession, SSEClient } from './types.js';
export declare function runInvestigation(target: string, clients: SSEClient[], session?: InvestigationSession): Promise<InvestigationSession>;
