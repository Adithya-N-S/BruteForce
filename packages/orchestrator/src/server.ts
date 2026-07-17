import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { runInvestigation } from './planner.js';
import type { InvestigationSession, SSEClient } from './types.js';

const app = express();
const PORT = parseInt(process.env.ORCHESTRATOR_PORT || '3001', 10);

app.use(express.json());

const sessions = new Map<string, InvestigationSession>();
const sseClients = new Map<string, SSEClient[]>();

app.post('/investigate', async (req: Request, res: Response) => {
  const { target } = req.body;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'target is required' });
    return;
  }

  const sessionId = crypto.randomUUID();
  const clients: SSEClient[] = [];
  sseClients.set(sessionId, clients);

  res.json({ investigation_id: sessionId });

  runInvestigation(target, clients).then(session => {
    sessions.set(sessionId, session);
  }).catch(err => {
    console.error('Investigation failed:', err);
  });
});

app.get('/stream/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const client: SSEClient = {
    id: crypto.randomUUID(),
    send(event: string, data: unknown) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      res.end();
    },
  };

  const clients = sseClients.get(id) || [];
  clients.push(client);
  sseClients.set(id, clients);

  client.send('connected', { investigation_id: id });

  const existingSession = sessions.get(id);
  if (existingSession && existingSession.status !== 'running') {
    client.send('investigation_complete', { status: existingSession.status, steps: existingSession.steps });
    if (existingSession.dossier) {
      client.send('dossier', existingSession.dossier);
    }
  }

  req.on('close', () => {
    const idx = clients.indexOf(client);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

app.get('/dossier/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: 'Investigation not found' });
    return;
  }
  if (!session.dossier) {
    res.status(202).json({ status: session.status, message: 'Investigation still in progress or no dossier yet' });
    return;
  }
  res.json({ dossier: session.dossier, narrative: session.narrative });
});

app.get('/audit/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: 'Investigation not found' });
    return;
  }
  res.json({
    investigation_id: id,
    target: session.target,
    status: session.status,
    steps: session.steps,
    edges_count: session.graphEdges.length,
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`Orchestrator running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /investigate    body: { target: string }`);
  console.log(`  GET  /stream/:id     SSE stream`);
  console.log(`  GET  /dossier/:id     Final dossier`);
  console.log(`  GET  /audit/:id       Audit trail`);
  console.log(`  GET  /health          Health check`);
});
