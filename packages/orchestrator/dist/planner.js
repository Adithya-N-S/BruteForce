import { GraphManager } from '@bruteforce/core';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import Anthropic from '@anthropic-ai/sdk';
import { adjudicate } from './adjudicator.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const MAX_STEPS = 12;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
const MCP_SERVER_ENTRY = resolve(WORKSPACE_ROOT, 'packages', 'mcp-server', 'src', 'index.ts');
function createSession(target) {
    return {
        id: crypto.randomUUID(),
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
    };
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
async function createMcpClient() {
    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['--yes', 'tsx', MCP_SERVER_ENTRY],
        env: {
            ...process.env,
            MCP_TRANSPORT_TYPE: 'stdio',
        },
        cwd: WORKSPACE_ROOT,
        stderr: 'pipe',
    });
    const client = new Client({ name: 'bruteforce-orchestrator', version: '0.1.0' }, { capabilities: {} });
    await client.connect(transport);
    return { client, transport };
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
    const response = await client.callTool({
        name: tool,
        arguments: args,
    });
    const result = parseToolResponse(response);
    if (response.isError) {
        return { result, newEdges: [] };
    }
    const newEdges = extractNewEdges(tool, result, existingEdges);
    return { result, newEdges };
}
function buildPlannerPrompt(target, targetEntityId, uboEntityId, steps, edges) {
    const gm = buildGraph(edges);
    const allEntities = gm.getAllEntities();
    const stats = gm.toEvidenceGraph();
    return `You are an investigation Planner. Your job is to uncover the Ultimate Beneficial Owner (UBO) of "${target}" by calling deterministic tools.

CRITICAL RULES (THE DETERMINISTIC WALL):
- You NEVER assert facts about ownership, entities, or percentages.
- You ONLY call tools. Every fact comes from a tool result.
- The ONLY source of ownership percentages is the compute_control tool.
- You NEVER produce numbers yourself.
- When explaining your reasoning, describe your INTENT, never state facts.

AVAILABLE TOOLS:
1. resolve_entity(name?, jurisdiction?, identifiers?) — Find entities by name/jurisdiction/identifiers
2. all_control_paths(from, to, max_depth?, min_edge_pct?) — Trace ownership chains between two entities
3. compute_control(root, target) — Calculate effective ownership percentage
4. find_shared_attributes(entity_id, attribute?) — Find entities sharing directors, addresses, or agents
5. co_consignee_links(entity_id) — Find trade co-consignee relationships
6. score_evidence(edge_ids) — Score evidence edges for confidence
7. match_sanctions(entity_id) — Match an entity against sanctions lists

INVESTIGATION STRATEGY:
1. Start by resolving the target company name to an entity ID using resolve_entity
2. Explore direct ownership paths (owns_pct edges)
3. If direct paths are thin, pivot to shared directors, addresses, or agents
4. When you find a potential UBO, compute control percentage using compute_control(root=<company_id>, target=<ubo_candidate_id>)
5. Check if control >= 25% threshold and match against sanctions
6. Use score_evidence to assess evidence quality on key edges

CURRENT STATE:
- Steps taken: ${steps}
- Entities discovered: ${stats.nodes.length}
- Edges discovered: ${stats.edges.length}
${targetEntityId ? `- Target entity ID resolved as: ${targetEntityId}` : '- Target entity ID not yet resolved'}
${uboEntityId ? `- Suspected UBO entity ID: ${uboEntityId}` : '- No UBO suspected yet'}
${allEntities.map(e => `  - ${e.id}: ${e.name} (${e.type}, ${e.jurisdiction})`).join('\n')}

You MUST respond with valid JSON ONLY in this exact format:
{"rationale": "your reasoning for the next action", "tool": "tool_name", "args": {"arg1": "value1"}}
OR if investigation is complete:
{"rationale": "reason for stopping", "stop": true, "reason": "Veil pierced or exhausted all avenues"}`;
}
async function runExplainer(mcpClient, target, dossier, sseClients) {
    const apiKey = ANTHROPIC_API_KEY;
    if (!apiKey)
        return '';
    const anthropic = new Anthropic({ apiKey });
    let systemPrompt = 'You are an investigation Explainer. Generate clear, sourced narrative only. Never invent facts.';
    if (mcpClient) {
        try {
            const promptResponse = await mcpClient.getPrompt({
                name: 'explanation_playbook',
                arguments: { target_company: target },
            });
            const promptContent = promptResponse.messages[0]?.content;
            if (promptContent && promptContent.type === 'text') {
                systemPrompt = promptContent.text;
            }
        }
        catch (e) {
            console.warn('Failed to fetch explanation_playbook prompt', e);
        }
    }
    const prompt = `${systemPrompt}\n\nHere is the complete dossier with all tool outputs:\n\n${JSON.stringify(dossier, null, 2)}\n\nGenerate a clear, professional investigation summary with sourced claims only.`;
    const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0,
        system: 'You are an investigation Explainer. Generate clear, sourced narrative only. Never invent facts.',
        messages: [{ role: 'user', content: prompt }],
    });
    const content = msg.content[0];
    const narrative = content.type === 'text' ? content.text : '';
    streamToAll(sseClients, 'explainer_narrative', { narrative });
    return narrative;
}
export async function runInvestigation(target, sseClients) {
    const session = createSession(target);
    const apiKey = ANTHROPIC_API_KEY;
    if (!apiKey) {
        session.status = 'error';
        session.error = 'ANTHROPIC_API_KEY not configured';
        streamToAll(sseClients, 'error', { message: 'ANTHROPIC_API_KEY not configured' });
        return session;
    }
    const anthropic = new Anthropic({ apiKey });
    let mcpClient = null;
    let mcpTransport = null;
    let lastControlValue = 0;
    try {
        const mcp = await createMcpClient();
        mcpClient = mcp.client;
        mcpTransport = mcp.transport;
        streamToAll(sseClients, 'mcp_connected', { message: 'Connected to MCP server' });
        while (session.steps < session.maxSteps && session.status === 'running') {
            const promptResponse = await mcpClient.getPrompt({
                name: 'investigation_playbook',
                arguments: { target_company: target },
            });
            const promptContent = promptResponse.messages[0]?.content;
            const systemPrompt = promptContent && promptContent.type === 'text' ? promptContent.text : 'You are an investigation planner.';
            const stats = `\n\nCURRENT STATE:\n- Steps taken: ${session.steps}\n- Target entity ID: ${session.targetEntityId || 'unknown'}\n- Suspected UBO ID: ${session.uboEntityId || 'none'}\n\nYou MUST respond with valid JSON ONLY in this exact format:\n{"rationale": "your reasoning for the next action", "tool": "tool_name", "args": {"arg1": "value1"}}\nOR if investigation is complete:\n{"rationale": "reason for stopping", "stop": true, "reason": "Veil pierced or exhausted all avenues"}`;
            const msg = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                temperature: 0,
                system: systemPrompt,
                messages: [{ role: 'user', content: systemPrompt + stats }],
            });
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
                streamToAll(sseClients, 'planner_decision', { step: session.steps, action: 'stop', rationale });
                break;
            }
            const tool = parsed.tool;
            const args = parsed.args || {};
            streamToAll(sseClients, 'planner_decision', { step: session.steps, tool, args, rationale });
            const { result, newEdges } = await runTool(mcpClient, tool, args, session.graphEdges);
            session.graphEdges.push(...newEdges);
            streamToAll(sseClients, 'tool_result', { step: session.steps, tool, args, result, new_edges_count: newEdges.length });
            for (const edge of newEdges) {
                streamToAll(sseClients, 'edge_found', { edge, step: session.steps });
            }
            if (tool === 'resolve_entity') {
                const r = result;
                if (r.matches && r.matches.length > 0 && !session.targetEntityId) {
                    session.targetEntityId = r.matches[0].entity_id;
                    streamToAll(sseClients, 'target_resolved', { entity_id: session.targetEntityId, step: session.steps });
                }
            }
            if (tool === 'compute_control') {
                const r = result;
                lastControlValue = r.effective_control ?? 0;
                session.uboEntityId = args.target || session.uboEntityId;
                streamToAll(sseClients, 'control_update', { effective_control: lastControlValue, meets_threshold: r.meets_threshold ?? false, step: session.steps });
            }
            if (tool === 'match_sanctions') {
                const r = result;
                streamToAll(sseClients, 'sanction_hit', { matches: r.matches ?? [], step: session.steps });
            }
            const sanctionsHit = session.graphEdges.some(e => e.type === 'listed_sanctioned');
            const verdict = adjudicate({
                effectiveControl: lastControlValue,
                sanctionsHit,
                edges: session.graphEdges,
            });
            session.verdict = verdict;
            streamToAll(sseClients, 'verdict_update', { verdict, step: session.steps });
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
                const dossierResponse = await mcpClient.callTool({
                    name: 'assemble_dossier',
                    arguments: {
                        root: session.targetEntityId,
                        target: session.uboEntityId || session.targetEntityId,
                    },
                });
                const dossier = parseToolResponse(dossierResponse);
                session.dossier = dossier;
                streamToAll(sseClients, 'dossier_assembled', { dossier });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                streamToAll(sseClients, 'error', { message: `Failed to assemble dossier: ${message}` });
            }
        }
        // Explainer step (runs after dossier assembly, even if not pierced)
        if (session.dossier && session.status !== 'error') {
            try {
                const narrative = await runExplainer(mcpClient, target, session.dossier, sseClients);
                session.narrative = narrative;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                streamToAll(sseClients, 'error', { message: `Explainer failed: ${message}` });
            }
        }
        streamToAll(sseClients, 'investigation_complete', { status: session.status, steps: session.steps });
    }
    catch (err) {
        session.status = 'error';
        session.error = err instanceof Error ? err.message : String(err);
        streamToAll(sseClients, 'error', { message: session.error });
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
function streamToAll(clients, event, data) {
    for (const client of clients) {
        client.send(event, data);
    }
}
