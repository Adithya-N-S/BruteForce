import { GraphManager, resolveEntity, allControlPaths, computeControl, findSharedAttributes, coConsigneeLinks, jaroWinklerSimilarity, normalizeEntityName } from '@bruteforce/core';
import Anthropic from '@anthropic-ai/sdk';
import { adjudicate } from './adjudicator.js';
const MAX_STEPS = 12;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
function createSession(target) {
    return {
        id: crypto.randomUUID(),
        target,
        targetEntityId: null,
        graphEdges: [],
        steps: 0,
        maxSteps: MAX_STEPS,
        status: 'running',
        verdict: null,
        dossier: null,
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
async function runTool(tool, args, sessionsEdges, sanctionsList) {
    const gm = buildGraph(sessionsEdges);
    let result = {};
    let newEdges = [];
    switch (tool) {
        case 'resolve_entity': {
            const entities = gm.getAllEntities();
            const ents = resolveEntity(entities, {
                name: args.name,
                jurisdiction: args.jurisdiction,
                identifiers: args.identifiers,
            });
            result = ents;
            break;
        }
        case 'all_control_paths': {
            const from = args.from;
            const to = args.to;
            if (!to) {
                result = { error: 'Target entity ID (to) is required', paths: [] };
                break;
            }
            try {
                const paths = allControlPaths(gm, { from, to, maxDepth: args.max_depth ?? 6, minEdgePct: args.min_edge_pct });
                result = { paths };
                for (const path of paths) {
                    for (const edge of path.path) {
                        if (!sessionsEdges.find(e => e.id === edge.id)) {
                            newEdges.push(edge);
                        }
                    }
                }
            }
            catch (err) {
                result = { error: err instanceof Error ? err.message : String(err), paths: [] };
            }
            break;
        }
        case 'compute_control': {
            const root = args.root;
            const target = args.target;
            try {
                const paths = allControlPaths(gm, { from: target, to: root, maxDepth: 6 });
                const controlResult = computeControl(paths);
                result = {
                    effective_control: controlResult.effectiveControl,
                    contributing_paths: controlResult.contributingPaths,
                    threshold: 0.25,
                    meets_threshold: controlResult.thresholdReached,
                    explanation: controlResult.explanation,
                };
            }
            catch (err) {
                result = { error: err instanceof Error ? err.message : String(err), effective_control: 0, meets_threshold: false };
            }
            break;
        }
        case 'find_shared_attributes': {
            try {
                const saResult = findSharedAttributes(gm, { entity_id: args.entity_id, attribute: args.attribute });
                result = saResult;
                for (const link of saResult.links) {
                    for (const edge of link.edges) {
                        if (!sessionsEdges.find(e => e.id === edge.id)) {
                            newEdges.push(edge);
                        }
                    }
                }
            }
            catch (err) {
                result = { error: err instanceof Error ? err.message : String(err), links: [] };
            }
            break;
        }
        case 'co_consignee_links': {
            try {
                const ccResult = coConsigneeLinks(gm, { entity_id: args.entity_id });
                result = ccResult;
                for (const edge of ccResult.links) {
                    if (!sessionsEdges.find(e => e.id === edge.id)) {
                        newEdges.push(edge);
                    }
                }
            }
            catch (err) {
                result = { error: err instanceof Error ? err.message : String(err), links: [] };
            }
            break;
        }
        case 'match_sanctions': {
            const entityId = args.entity_id;
            const entity = gm.getEntity(entityId);
            if (!entity) {
                result = { matches: [], error: `Entity not found: ${entityId}` };
                break;
            }
            const entityName = normalizeEntityName(entity.name);
            const matches = [];
            for (const sanction of sanctionsList) {
                const s = sanction;
                const sanctionName = normalizeEntityName(s.name || '');
                const score = jaroWinklerSimilarity(entityName, sanctionName);
                if (score >= 0.65) {
                    matches.push({
                        sanction_id: s.id || `sanction-${matches.length}`,
                        list: s.list || 'unknown',
                        rationale: `Name similarity ${(score * 100).toFixed(0)}% between '${entity.name}' and '${s.name}'`,
                        score,
                    });
                }
            }
            matches.sort((a, b) => b.score - a.score);
            result = { matches };
            break;
        }
        default:
            result = { error: `Unknown tool: ${tool}` };
    }
    return { result, newEdges };
}
function buildPlannerPrompt(target, targetEntityId, steps, edges) {
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
6. match_sanctions(entity_id) — Match an entity against sanctions lists

INVESTIGATION STRATEGY:
1. Start by resolving the target company name to an entity ID using resolve_entity
2. Explore direct ownership paths (owns_pct edges)
3. If direct paths are thin, pivot to shared directors, addresses, or agents
4. When you find a potential UBO, compute control percentage
5. Check if control >= 25% threshold and match against sanctions

CURRENT STATE:
- Steps taken: ${steps}
- Entities discovered: ${stats.nodes.length}
- Edges discovered: ${stats.edges.length}
${targetEntityId ? `- Target entity ID resolved as: ${targetEntityId}` : '- Target entity ID not yet resolved'}
${allEntities.map(e => `  - ${e.id}: ${e.name} (${e.type}, ${e.jurisdiction})`).join('\n')}

You MUST respond with valid JSON ONLY in this exact format:
{"rationale": "your reasoning for the next action", "tool": "tool_name", "args": {"arg1": "value1"}}
OR if investigation is complete:
{"rationale": "reason for stopping", "stop": true, "reason": "Veil pierced or exhausted all avenues"}`;
}
export async function runInvestigation(target, sanctionsList, sseClients) {
    const session = createSession(target);
    const apiKey = ANTHROPIC_API_KEY;
    if (!apiKey) {
        session.status = 'error';
        session.error = 'ANTHROPIC_API_KEY not configured';
        for (const client of sseClients) {
            client.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
        }
        return session;
    }
    const anthropic = new Anthropic({ apiKey });
    try {
        while (session.steps < session.maxSteps && session.status === 'running') {
            const prompt = buildPlannerPrompt(target, session.targetEntityId, session.steps, session.graphEdges);
            const msg = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                temperature: 0,
                system: 'You are an investigation planner. Respond with valid JSON only. Never make up facts or numbers.',
                messages: [{ role: 'user', content: prompt }],
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
                session.status = 'pierced';
                for (const client of sseClients) {
                    client.send('planner_decision', { step: session.steps, action: 'stop', rationale });
                }
                break;
            }
            const tool = parsed.tool;
            const args = parsed.args || {};
            for (const client of sseClients) {
                client.send('planner_decision', { step: session.steps, tool, args, rationale });
            }
            const { result, newEdges } = await runTool(tool, args, session.graphEdges, sanctionsList);
            session.graphEdges.push(...newEdges);
            for (const client of sseClients) {
                client.send('tool_result', { step: session.steps, tool, args, result, new_edges_count: newEdges.length });
            }
            for (const edge of newEdges) {
                for (const client of sseClients) {
                    client.send('edge_found', { edge, step: session.steps });
                }
            }
            if (tool === 'resolve_entity') {
                const r = result;
                if (r.matches && r.matches.length > 0 && !session.targetEntityId) {
                    session.targetEntityId = r.matches[0].entity_id;
                    for (const client of sseClients) {
                        client.send('target_resolved', { entity_id: session.targetEntityId, step: session.steps });
                    }
                }
            }
            if (tool === 'compute_control') {
                const r = result;
                for (const client of sseClients) {
                    client.send('control_update', { effective_control: r.effective_control ?? 0, meets_threshold: r.meets_threshold ?? false, step: session.steps });
                }
            }
            if (tool === 'match_sanctions') {
                const r = result;
                for (const client of sseClients) {
                    client.send('sanction_hit', { matches: r.matches ?? [], step: session.steps });
                }
            }
            const controlResult = session.graphEdges.length > 0 ? (() => {
                try {
                    const gm = buildGraph(session.graphEdges);
                    if (session.targetEntityId) {
                        const entities = gm.getAllEntities();
                        for (const entity of entities) {
                            if (entity.id !== session.targetEntityId) {
                                const paths = allControlPaths(gm, { from: entity.id, to: session.targetEntityId, maxDepth: 6 });
                                if (paths.length > 0) {
                                    const cc = computeControl(paths);
                                    return { effective_control: cc.effectiveControl, target: entity.id };
                                }
                            }
                        }
                    }
                }
                catch { }
                return null;
            })() : null;
            const sanctionsHit = session.graphEdges.some(e => e.type === 'listed_sanctioned');
            const verdict = adjudicate({
                effectiveControl: controlResult?.effective_control ?? 0,
                sanctionsHit,
                edges: session.graphEdges,
            });
            session.verdict = verdict;
            for (const client of sseClients) {
                client.send('verdict_update', { verdict, step: session.steps });
            }
            if (verdict.pierced) {
                session.status = 'pierced';
                break;
            }
            session.steps++;
        }
        if (session.status === 'running') {
            session.status = 'exhausted';
        }
        for (const client of sseClients) {
            client.send('investigation_complete', { status: session.status, steps: session.steps });
        }
    }
    catch (err) {
        session.status = 'error';
        session.error = err instanceof Error ? err.message : String(err);
        for (const client of sseClients) {
            client.send('error', { message: session.error });
        }
    }
    return session;
}
