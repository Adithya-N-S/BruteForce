import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runInvestigation } from './planner.js';
const app = express();
const PORT = parseInt(process.env.ORCHESTRATOR_PORT || '3001', 10);
app.use(express.json());
const sessions = new Map();
const sseClients = new Map();
function loadSanctionsList() {
    try {
        const currentDir = dirname(fileURLToPath(import.meta.url));
        const path = resolve(currentDir, '..', '..', 'data', 'seed', 'sanctions_list.json');
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        return Array.isArray(data) ? data : [];
    }
    catch {
        return [];
    }
}
const sanctionsList = loadSanctionsList();
app.post('/investigate', async (req, res) => {
    const { target } = req.body;
    if (!target || typeof target !== 'string') {
        res.status(400).json({ error: 'target is required' });
        return;
    }
    const sessionId = crypto.randomUUID();
    const clients = [];
    sseClients.set(sessionId, clients);
    res.json({ investigation_id: sessionId });
    runInvestigation(target, sanctionsList, clients).then(session => {
        sessions.set(sessionId, session);
    }).catch(err => {
        console.error('Investigation failed:', err);
    });
});
app.get('/stream/:id', (req, res) => {
    const id = req.params.id;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });
    const client = {
        id: crypto.randomUUID(),
        send(event, data) {
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
        if (idx >= 0)
            clients.splice(idx, 1);
    });
});
app.get('/dossier/:id', (req, res) => {
    const id = req.params.id;
    const session = sessions.get(id);
    if (!session) {
        res.status(404).json({ error: 'Investigation not found' });
        return;
    }
    if (!session.dossier) {
        res.status(202).json({ status: session.status, message: 'Investigation still in progress or no dossier yet' });
        return;
    }
    res.json(session.dossier);
});
app.get('/audit/:id', (req, res) => {
    const id = req.params.id;
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
app.get('/health', (_req, res) => {
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
