import 'dotenv/config';
import type { InvestigationSession, SSEClient } from './types.js';
declare const sessions: Map<string, InvestigationSession>;
declare const sseClients: Map<string, SSEClient[]>;
declare function addToEventBuffer(session: InvestigationSession, event: string, data: unknown, id: number): void;
export { sessions, sseClients, addToEventBuffer };
