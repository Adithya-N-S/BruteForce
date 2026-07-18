import 'dotenv/config';
import express from 'express';
import { runInvestigation } from './planner.js';
import { Logger } from './logger.js';
const log = new Logger('server');
const app = express();
const PORT = parseInt(process.env.ORCHESTRATOR_PORT || '3001', 10);
app.use(express.json());
// Global CORS
app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID');
    if (_req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
const sessions = new Map();
const sseClients = new Map();
const MAX_EVENT_BUFFER = 200;
function createSession(target) {
    return {
        id: crypto.randomUUID(),
        target,
        targetEntityId: null,
        uboEntityId: null,
        graphEdges: [],
        steps: 0,
        maxSteps: 12,
        status: 'running',
        verdict: null,
        dossier: null,
        narrative: null,
        createdAt: new Date().toISOString(),
        eventBuffer: [],
        nextEventId: 1,
    };
}
function addToEventBuffer(session, event, data, id) {
    const entry = { id, event, data, timestamp: new Date().toISOString() };
    session.eventBuffer.push(entry);
    if (session.eventBuffer.length > MAX_EVENT_BUFFER) {
        session.eventBuffer.splice(0, session.eventBuffer.length - MAX_EVENT_BUFFER);
    }
}
app.post('/investigate', async (req, res) => {
    const { target } = req.body;
    if (!target || typeof target !== 'string' || target.trim().length === 0) {
        res.status(400).json({ error: 'Target must be a non-empty string', code: 'INVALID_TARGET' });
        return;
    }
    if (target.trim().length > 500) {
        res.status(400).json({ error: 'Target must be 500 characters or fewer', code: 'TARGET_TOO_LONG' });
        return;
    }
    const sessionId = crypto.randomUUID();
    const clients = [];
    sseClients.set(sessionId, clients);
    log.info('Investigation started', { investigation_id: sessionId, target: target.trim() });
    res.json({ investigation_id: sessionId });
    runInvestigation(target.trim(), clients).then(session => {
        sessions.set(sessionId, session);
        log.info('Investigation completed', { investigation_id: sessionId, status: session.status, steps: session.steps });
    }).catch(err => {
        log.error('Investigation failed', { investigation_id: sessionId, error: String(err) });
    });
});
app.get('/stream/:id', (req, res) => {
    const id = req.params.id;
    const lastEventHeader = req.headers['last-event-id'];
    const lastEventHeaderStr = Array.isArray(lastEventHeader) ? lastEventHeader[0] : lastEventHeader;
    const lastEventId = lastEventHeaderStr ? parseInt(lastEventHeaderStr, 10) : 0;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });
    const client = {
        id: crypto.randomUUID(),
        send(event, data) {
            res.write(`id: ${Date.now()}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        close() {
            res.end();
        },
    };
    const clients = sseClients.get(id) || [];
    clients.push(client);
    sseClients.set(id, clients);
    // Replay buffered events on reconnect
    const existingSession = sessions.get(id);
    if (existingSession && lastEventId > 0) {
        const replayEvents = existingSession.eventBuffer.filter(e => e.id > lastEventId);
        for (const entry of replayEvents) {
            res.write(`id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`);
        }
    }
    else if (existingSession && existingSession.eventBuffer.length > 0) {
        for (const entry of existingSession.eventBuffer) {
            res.write(`id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`);
        }
    }
    client.send('connected', { investigation_id: id });
    // Send final state if investigation already completed
    if (existingSession && existingSession.status !== 'running') {
        client.send('investigation_complete', { status: existingSession.status, steps: existingSession.steps });
        if (existingSession.dossier) {
            client.send('dossier', existingSession.dossier);
        }
    }
    // SSE keepalive
    const keepalive = setInterval(() => {
        try {
            res.write(':keepalive\n\n');
        }
        catch {
            clearInterval(keepalive);
        }
    }, 15000);
    req.on('close', () => {
        clearInterval(keepalive);
        const idx = clients.indexOf(client);
        if (idx >= 0)
            clients.splice(idx, 1);
    });
});
app.get('/dossier/:id', (req, res) => {
    const id = req.params.id;
    const session = sessions.get(id);
    if (!session) {
        res.status(404).json({ error: 'Investigation not found', code: 'NOT_FOUND' });
        return;
    }
    if (!session.dossier) {
        res.status(202).json({ status: session.status, message: 'Investigation still in progress or no dossier yet' });
        return;
    }
    res.json({ dossier: session.dossier, narrative: session.narrative });
});
app.get('/audit/:id', (req, res) => {
    const id = req.params.id;
    const session = sessions.get(id);
    if (!session) {
        res.status(404).json({ error: 'Investigation not found', code: 'NOT_FOUND' });
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
    log.info(`Orchestrator running on http://localhost:${PORT}`, { port: PORT });
});
export { sessions, sseClients, addToEventBuffer };
