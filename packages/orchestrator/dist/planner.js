import { GraphManager } from '@bruteforce/core';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Anthropic from '@anthropic-ai/sdk';
import { adjudicate } from './adjudicator.js';
import { Logger } from './logger.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
const log = new Logger('planner');
const MAX_STEPS = 12;
const TOOL_TIMEOUT_MS = 30_000;
const ANTHROPIC_TIMEOUT_MS = 60_000;
const OVERALL_TIMEOUT_MS = 300_000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MAX_EVENT_BUFFER = 200;
const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
const MCP_SERVER_SRC = resolve(WORKSPACE_ROOT, 'packages', 'mcp-server', 'src', 'index.ts');
const MCP_SERVER_DIST = resolve(WORKSPACE_ROOT, 'packages', 'mcp-server', 'dist', 'index.js');
function getMcpServerEntry() {
    // Prefer compiled dist (Nitrostack decorators require proper compilation)
    if (existsSync(MCP_SERVER_DIST)) {
        return { command: 'node', args: [MCP_SERVER_DIST] };
    }
    // Fall back to tsx for dev
    log.warn('MCP server dist not found, falling back to tsx', { dist: MCP_SERVER_DIST });
    return { command: 'npx', args: ['--yes', 'tsx', MCP_SERVER_SRC] };
}
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)),
    ]);
}
function buildGraph(edges) {
    const gm = new GraphManager();
    const seenEntities = new Set();
    for (const edge of edges) {
        if (!seenEntities.has(edge.from)) {
            seenEntities.add(edge.from);
            gm.addEntity({ id: edge.from, type: 'company', name: edge.from, jurisdiction: '', attributes: {} });
        }
        if (!seenEntities.has(edge.to)) {
            seenEntities.add(edge.to);
            gm.addEntity({ id: edge.to, type: 'company', name: edge.to, jurisdiction: '', attributes: {} });
        }
        try {
            gm.addRelationship(edge);
        }
        catch (_) { }
    }
    return gm;
}
async function createMcpClient(retries = 2) {
    const mcpServerUrl = process.env.MCP_SERVER_URL;
    // If MCP_SERVER_URL is set, use HTTP transport instead of STDIO
    if (mcpServerUrl) {
        log.info('Using MCP HTTP transport', { url: mcpServerUrl });
        const httpTransport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
        const client = new Client({ name: 'bruteforce-orchestrator', version: '0.1.0' }, { capabilities: {} });
        await client.connect(httpTransport);
        return { client, transport: httpTransport };
    }
    let lastError = null;
    const entry = getMcpServerEntry();
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const transport = new StdioClientTransport({
                command: entry.command,
                args: entry.args,
                env: {
                    ...process.env,
                    MCP_TRANSPORT_TYPE: 'stdio',
                },
                cwd: WORKSPACE_ROOT,
                stderr: 'pipe',
            });
            const client = new Client({ name: 'bruteforce-orchestrator', version: '0.1.0' }, { capabilities: {} });
            await client.connect(transport);
            transport.onclose = () => {
                log.warn('MCP transport closed unexpectedly');
            };
            transport.onerror = (error) => {
                log.error('MCP transport error', { error: error.message });
            };
            return { client, transport };
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            log.warn('MCP client connection attempt failed', { attempt, error: lastError.message });
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
            }
        }
    }
    throw lastError || new Error('Failed to create MCP client');
}
function parseToolResponse(response) {
    const r = response;
    const content = r.content;
    if (!content)
        return {};
    const textContent = content.find(c => c.type === 'text');
    if (!textContent?.text)
        return {};
    try {
        return JSON.parse(textContent.text);
    }
    catch {
        return {};
    }
}
function extractNewEdges(tool, result, existingEdges) {
    const newEdges = [];
    const r = result;
    if (tool === 'all_control_paths' && Array.isArray(r.paths)) {
        for (const path of r.paths) {
            const p = path;
            if (Array.isArray(p.path)) {
                for (const edge of p.path) {
                    const e = edge;
                    if (!existingEdges.find(ex => ex.id === e.id)) {
                        newEdges.push(e);
                    }
                }
            }
        }
    }
    if (tool === 'find_shared_attributes' && Array.isArray(r.links)) {
        for (const link of r.links) {
            const l = link;
            if (Array.isArray(l.edges)) {
                for (const edge of l.edges) {
                    const e = edge;
                    if (!existingEdges.find(ex => ex.id === e.id)) {
                        newEdges.push(e);
                    }
                }
            }
        }
    }
    if (tool === 'co_consignee_links' && Array.isArray(r.links)) {
        for (const edge of r.links) {
            const e = edge;
            if (!existingEdges.find(ex => ex.id === e.id)) {
                newEdges.push(e);
            }
        }
    }
    return newEdges;
}
async function runTool(client, tool, args, existingEdges) {
    const response = await withTimeout(client.callTool({ name: tool, arguments: args }), TOOL_TIMEOUT_MS, `tool:${tool}`);
    const result = parseToolResponse(response);
    if (response.isError) {
        return { result, newEdges: [] };
    }
    const newEdges = extractNewEdges(tool, result, existingEdges);
    return { result, newEdges };
}
async function runExplainer(mcpClient, target, dossier, session, clients) {
    const apiKey = ANTHROPIC_API_KEY;
    if (!apiKey)
        return '';
    const anthropic = new Anthropic({ apiKey });
    const explainerResponse = await mcpClient.getPrompt({
        name: 'explanation_playbook',
        arguments: { target_company: target },
    });
    const explainerPrompt = explainerResponse.messages[0]?.content?.type === 'text' ? explainerResponse.messages[0].content.text : '';
    const sarResponse = await mcpClient.getPrompt({
        name: 'sar_summary_template',
        arguments: {
            target_company: target,
            ubo_name: session.uboEntityId || 'Unknown UBO',
        },
    });
    const sarTemplate = sarResponse.messages.map(m => m.content?.type === 'text' ? m.content.text : '').join('\n\n');
    const prompt = `Here is the dossier:\n${JSON.stringify(dossier, null, 2)}\n\nNow fill out the following SAR template based ONLY on the dossier facts:\n${sarTemplate}`;
    const msg = await withTimeout(anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0,
        system: explainerPrompt,
        messages: [{ role: 'user', content: prompt }],
    }), ANTHROPIC_TIMEOUT_MS, 'anthropic:explainer');
    const content = msg.content[0];
    const narrative = content.type === 'text' ? content.text : '';
    emitEvent(session, clients, 'explainer_narrative', { narrative });
    return narrative;
}
function emitEvent(session, clients, event, data) {
    const id = session.nextEventId++;
    const entry = { id, event, data, timestamp: new Date().toISOString() };
    session.eventBuffer.push(entry);
    if (session.eventBuffer.length > MAX_EVENT_BUFFER) {
        session.eventBuffer.splice(0, session.eventBuffer.length - MAX_EVENT_BUFFER);
    }
    for (const client of clients) {
        client.send(event, data);
    }
}
export async function runInvestigation(target, clients, session) {
    const investigationId = session?.id || 'unknown';
    const apiKey = ANTHROPIC_API_KEY;
    if (!session) {
        session = {
            id: investigationId,
            target,
            targetEntityId: null,
            uboEntityId: null,
            graphEdges: [],
            steps: 0,
            maxSteps: MAX_STEPS,
            status: 'running',
            verdict: null,
            dossier: null,
            narrative: null,
            createdAt: new Date().toISOString(),
            eventBuffer: [],
            nextEventId: 1,
        };
    }
    if (!apiKey) {
        session.status = 'error';
        session.error = 'ANTHROPIC_API_KEY not configured';
        emitEvent(session, clients, 'error', { message: 'ANTHROPIC_API_KEY not configured' });
        return session;
    }
    const anthropic = new Anthropic({ apiKey });
    let mcpClient = null;
    let mcpTransport = null;
    let lastControlValue = 0;
    const startTime = Date.now();
    try {
        const mcp = await createMcpClient();
        mcpClient = mcp.client;
        mcpTransport = mcp.transport;
        log.info('MCP client connected', { investigation_id: session.id });
        emitEvent(session, clients, 'mcp_connected', { message: 'Connected to MCP server' });
        const promptResponse = await withTimeout(mcpClient.getPrompt({
            name: 'investigation_playbook',
            arguments: { target_company: target },
        }), TOOL_TIMEOUT_MS, 'mcp:getPrompt:investigation_playbook');
        const promptContent = promptResponse.messages[0]?.content;
        const systemPromptText = promptContent && promptContent.type === 'text' ? promptContent.text : '';
        while (session.steps < session.maxSteps && session.status === 'running') {
            // Check overall timeout
            if (Date.now() - startTime > OVERALL_TIMEOUT_MS) {
                log.warn('Investigation timed out', { investigation_id: session.id, elapsed: Date.now() - startTime });
                session.status = 'exhausted';
                emitEvent(session, clients, 'warning', { message: 'Investigation timed out after 5 minutes' });
                break;
            }
            const gm = buildGraph(session.graphEdges);
            const allEntities = gm.getAllEntities();
            const stats = gm.toEvidenceGraph();
            const currentState = `CURRENT STATE:
- Steps taken: ${session.steps}
- Entities discovered: ${stats.nodes.length}
- Edges discovered: ${stats.edges.length}
${session.targetEntityId ? `- Target entity ID resolved as: ${session.targetEntityId}` : '- Target entity ID not yet resolved'}
${session.uboEntityId ? `- Suspected UBO entity ID: ${session.uboEntityId}` : '- No UBO suspected yet'}
${allEntities.map(e => `  - ${e.id}: ${e.name} (${e.type}, ${e.jurisdiction})`).join('\n')}`;
            let msg;
            try {
                msg = await withTimeout(anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1024,
                    temperature: 0,
                    system: systemPromptText,
                    messages: [{ role: 'user', content: currentState }],
                }), ANTHROPIC_TIMEOUT_MS, 'anthropic:planner');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn('Anthropic API timeout or error', { investigation_id: session.id, step: session.steps, error: message });
                emitEvent(session, clients, 'warning', { message: `Planner API error: ${message}` });
                session.steps++;
                continue;
            }
            const content = msg.content[0];
            if (content.type !== 'text') {
                session.status = 'error';
                session.error = 'Unexpected response from Claude';
                break;
            }
            let parsed;
            try {
                parsed = JSON.parse(content.text);
            }
            catch {
                session.status = 'error';
                session.error = `Failed to parse Claude response: ${content.text}`;
                break;
            }
            const rationale = parsed.rationale || '';
            if (parsed.stop) {
                if (typeof parsed.reason === 'string' && parsed.reason === 'Veil pierced') {
                    session.status = 'pierced';
                }
                else {
                    session.status = 'exhausted';
                }
                emitEvent(session, clients, 'planner_decision', { step: session.steps, action: 'stop', rationale });
                break;
            }
            const tool = parsed.tool;
            const args = parsed.args || {};
            emitEvent(session, clients, 'planner_decision', { step: session.steps, tool, args, rationale });
            let result = {};
            let newEdges = [];
            try {
                const toolResult = await runTool(mcpClient, tool, args, session.graphEdges);
                result = toolResult.result;
                newEdges = toolResult.newEdges;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Tool call failed', { investigation_id: session.id, tool, error: message });
                emitEvent(session, clients, 'warning', { message: `Tool ${tool} failed: ${message}` });
                session.steps++;
                continue;
            }
            session.graphEdges.push(...newEdges);
            emitEvent(session, clients, 'tool_result', { step: session.steps, tool, args, result, new_edges_count: newEdges.length });
            for (const edge of newEdges) {
                emitEvent(session, clients, 'edge_found', { edge, step: session.steps });
            }
            if (tool === 'resolve_entity') {
                const r = result;
                if (r.matches && r.matches.length > 0 && !session.targetEntityId) {
                    session.targetEntityId = r.matches[0].entity_id;
                    emitEvent(session, clients, 'target_resolved', { entity_id: session.targetEntityId, step: session.steps });
                }
            }
            if (tool === 'compute_control') {
                const r = result;
                lastControlValue = r.effective_control ?? 0;
                session.uboEntityId = args.target || session.uboEntityId;
                emitEvent(session, clients, 'control_update', { effective_control: lastControlValue, meets_threshold: r.meets_threshold ?? false, step: session.steps });
            }
            if (tool === 'match_sanctions') {
                const r = result;
                emitEvent(session, clients, 'sanction_hit', { matches: r.matches ?? [], step: session.steps });
            }
            const sanctionsHit = session.graphEdges.some(e => e.type === 'listed_sanctioned');
            const verdict = adjudicate({
                effectiveControl: lastControlValue,
                sanctionsHit,
                edges: session.graphEdges,
            });
            session.verdict = verdict;
            emitEvent(session, clients, 'verdict_update', { verdict, step: session.steps });
            if (verdict.pierced) {
                session.status = 'pierced';
                break;
            }
            session.steps++;
        }
        if (session.status === 'running') {
            session.status = 'exhausted';
        }
        // Assemble dossier via MCP
        if (session.targetEntityId && mcpClient) {
            try {
                const dossierResponse = await withTimeout(mcpClient.callTool({
                    name: 'assemble_dossier',
                    arguments: {
                        root: session.targetEntityId,
                        target: session.uboEntityId || session.targetEntityId,
                    },
                }), TOOL_TIMEOUT_MS, 'tool:assemble_dossier');
                const dossier = parseToolResponse(dossierResponse);
                session.dossier = dossier;
                emitEvent(session, clients, 'dossier_assembled', { dossier });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Dossier assembly failed', { investigation_id: session.id, error: message });
                emitEvent(session, clients, 'error', { message: `Failed to assemble dossier: ${message}` });
            }
        }
        // Explainer step
        if (session.dossier && session.status !== 'error') {
            try {
                const narrative = await runExplainer(mcpClient, target, session.dossier, session, clients);
                session.narrative = narrative;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn('Explainer failed', { investigation_id: session.id, error: message });
                emitEvent(session, clients, 'error', { message: `Explainer failed: ${message}` });
            }
        }
        log.info('Investigation finished', { investigation_id: session.id, status: session.status, steps: session.steps });
        emitEvent(session, clients, 'investigation_complete', { status: session.status, steps: session.steps });
    }
    catch (err) {
        session.status = 'error';
        session.error = err instanceof Error ? err.message : String(err);
        log.error('Investigation crashed', { investigation_id: session.id, error: session.error });
        emitEvent(session, clients, 'error', { message: session.error });
    }
    finally {
        if (mcpTransport) {
            try {
                await mcpTransport.close();
            }
            catch { }
        }
    }
    return session;
}
