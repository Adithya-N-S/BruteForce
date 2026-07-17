import { GraphManager } from '@bruteforce/core';
import type { EvidenceEdge } from '@bruteforce/core';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import Anthropic from '@anthropic-ai/sdk';
import { adjudicate } from './adjudicator.js';
import type { InvestigationSession, SSEClient } from './types.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const MAX_STEPS = 12;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
const MCP_SERVER_ENTRY = resolve(WORKSPACE_ROOT, 'packages', 'mcp-server', 'src', 'index.ts');

function createSession(target: string): InvestigationSession {
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

function buildGraph(edges: EvidenceEdge[]): GraphManager {
  const gm = new GraphManager();
  const seenEntities = new Set<string>();
  for (const edge of edges) {
    if (!seenEntities.has(edge.from)) {
      seenEntities.add(edge.from);
      gm.addEntity({ id: edge.from, type: 'company', name: edge.from, jurisdiction: '', attributes: {} });
    }
    if (!seenEntities.has(edge.to)) {
      seenEntities.add(edge.to);
      gm.addEntity({ id: edge.to, type: 'company', name: edge.to, jurisdiction: '', attributes: {} });
    }
    try { gm.addRelationship(edge); } catch (_) {}
  }
  return gm;
}

async function createMcpClient(): Promise<{ client: Client; transport: Transport }> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', MCP_SERVER_ENTRY],
    env: {
      ...process.env as Record<string, string>,
      MCP_TRANSPORT_TYPE: 'stdio',
    },
    cwd: WORKSPACE_ROOT,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'bruteforce-orchestrator', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  return { client, transport };
}

function parseToolResponse(response: unknown): unknown {
  const r = response as Record<string, unknown>;
  const content = r.content as Array<{ type: string; text?: string }> | undefined;
  if (!content) return {};
  const textContent = content.find(c => c.type === 'text');
  if (!textContent?.text) return {};
  try {
    return JSON.parse(textContent.text);
  } catch {
    return {};
  }
}

function extractNewEdges(tool: string, result: unknown, existingEdges: EvidenceEdge[]): EvidenceEdge[] {
  const newEdges: EvidenceEdge[] = [];
  const r = result as Record<string, unknown>;

  if (tool === 'all_control_paths' && Array.isArray(r.paths)) {
    for (const path of r.paths) {
      const p = path as Record<string, unknown>;
      if (Array.isArray(p.path)) {
        for (const edge of p.path) {
          const e = edge as EvidenceEdge;
          if (!existingEdges.find(ex => ex.id === e.id)) {
            newEdges.push(e);
          }
        }
      }
    }
  }

  if (tool === 'find_shared_attributes' && Array.isArray(r.links)) {
    for (const link of r.links) {
      const l = link as Record<string, unknown>;
      if (Array.isArray(l.edges)) {
        for (const edge of l.edges) {
          const e = edge as EvidenceEdge;
          if (!existingEdges.find(ex => ex.id === e.id)) {
            newEdges.push(e);
          }
        }
      }
    }
  }

  if (tool === 'co_consignee_links' && Array.isArray(r.links)) {
    for (const edge of r.links) {
      const e = edge as EvidenceEdge;
      if (!existingEdges.find(ex => ex.id === e.id)) {
        newEdges.push(e);
      }
    }
  }

  return newEdges;
}

async function runTool(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  existingEdges: EvidenceEdge[]
): Promise<{ result: unknown; newEdges: EvidenceEdge[] }> {
  const response = await client.callTool({
    name: tool,
    arguments: args,
  });

  const result = parseToolResponse(response);

  if ((response as Record<string, unknown>).isError) {
    return { result, newEdges: [] };
  }

  const newEdges = extractNewEdges(tool, result, existingEdges);
  return { result, newEdges };
}

function buildPlannerPrompt(
  target: string,
  targetEntityId: string | null,
  uboEntityId: string | null,
  steps: number,
  edges: EvidenceEdge[]
): string {
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

async function runExplainer(
  mcpClient: Client | null,
  target: string,
  dossier: unknown,
  sseClients: SSEClient[]
): Promise<string> {
  const apiKey = ANTHROPIC_API_KEY;
  if (!apiKey) return '';

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
    } catch (e) {
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

export async function runInvestigation(
  target: string,
  sseClients: SSEClient[]
): Promise<InvestigationSession> {
  const session = createSession(target);
  const apiKey = ANTHROPIC_API_KEY;

  if (!apiKey) {
    session.status = 'error';
    session.error = 'ANTHROPIC_API_KEY not configured';
    streamToAll(sseClients, 'error', { message: 'ANTHROPIC_API_KEY not configured' });
    return session;
  }

  const anthropic = new Anthropic({ apiKey });
  let mcpClient: Client | null = null;
  let mcpTransport: Transport | null = null;
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

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content.text);
      } catch {
        session.status = 'error';
        session.error = `Failed to parse Claude response: ${content.text}`;
        break;
      }

      const rationale = (parsed.rationale as string) || '';

      if (parsed.stop) {
        if (typeof parsed.reason === 'string' && parsed.reason === 'Veil pierced') {
          session.status = 'pierced';
        } else {
          session.status = 'exhausted';
        }
        streamToAll(sseClients, 'planner_decision', { step: session.steps, action: 'stop', rationale });
        break;
      }

      const tool = parsed.tool as string;
      const args = (parsed.args as Record<string, unknown>) || {};

      streamToAll(sseClients, 'planner_decision', { step: session.steps, tool, args, rationale });

      const { result, newEdges } = await runTool(mcpClient, tool, args, session.graphEdges);

      session.graphEdges.push(...newEdges);

      streamToAll(sseClients, 'tool_result', { step: session.steps, tool, args, result, new_edges_count: newEdges.length });

      for (const edge of newEdges) {
        streamToAll(sseClients, 'edge_found', { edge, step: session.steps });
      }

      if (tool === 'resolve_entity') {
        const r = result as { matches?: Array<{ entity_id: string }> };
        if (r.matches && r.matches.length > 0 && !session.targetEntityId) {
          session.targetEntityId = r.matches[0].entity_id;
          streamToAll(sseClients, 'target_resolved', { entity_id: session.targetEntityId, step: session.steps });
        }
      }

      if (tool === 'compute_control') {
        const r = result as { effective_control?: number; meets_threshold?: boolean };
        lastControlValue = r.effective_control ?? 0;
        session.uboEntityId = (args.target as string) || session.uboEntityId;
        streamToAll(sseClients, 'control_update', { effective_control: lastControlValue, meets_threshold: r.meets_threshold ?? false, step: session.steps });
      }

      if (tool === 'match_sanctions') {
        const r = result as { matches?: Array<unknown> };
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
        session.dossier = dossier as InvestigationSession['dossier'];
        streamToAll(sseClients, 'dossier_assembled', { dossier });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        streamToAll(sseClients, 'error', { message: `Failed to assemble dossier: ${message}` });
      }
    }

    // Explainer step (runs after dossier assembly, even if not pierced)
    if (session.dossier && session.status !== 'error') {
      try {
        const narrative = await runExplainer(mcpClient, target, session.dossier, sseClients);
        session.narrative = narrative;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        streamToAll(sseClients, 'error', { message: `Explainer failed: ${message}` });
      }
    }

    streamToAll(sseClients, 'investigation_complete', { status: session.status, steps: session.steps });
  } catch (err: unknown) {
    session.status = 'error';
    session.error = err instanceof Error ? err.message : String(err);
    streamToAll(sseClients, 'error', { message: session.error });
  } finally {
    if (mcpTransport) {
      try { await mcpTransport.close(); } catch {}
    }
  }

  return session;
}

function streamToAll(clients: SSEClient[], event: string, data: unknown): void {
  for (const client of clients) {
    client.send(event, data);
  }
}
