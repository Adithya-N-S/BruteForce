import { ToolDecorator as Tool, ControllerDecorator as Controller, Widget, z, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';
import {
  resolveEntity,
  allControlPaths,
  computeControl,
  findSharedAttributes,
  coConsigneeLinks,
  scoreEvidence,
  matchSanctions,
  assembleDossier,
} from '@bruteforce/core';

@Controller()
export class InvestigationTools {
  constructor(private readonly graphService: GraphService) {}

  @Tool({
    name: 'resolve_entity',
    description: 'Deterministic entity resolution using blocking + Jaro-Winkler similarity. Returns scored matches with matched features. No LLM involved.',
    inputSchema: z.object({
      name: z.string().optional().describe('Entity name to search for'),
      jurisdiction: z.string().optional().describe('Jurisdiction filter (e.g. BVI, UK, RU)'),
      identifiers: z.array(z.string()).optional().describe('Known identifiers to match against'),
    }),
  })
  async resolveEntityTool(
    input: { name?: string; jurisdiction?: string; identifiers?: string[] },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    const entities = graph.getAllEntities();
    const result = resolveEntity(entities, {
      name: input.name,
      jurisdiction: input.jurisdiction,
      identifiers: input.identifiers,
    });
    this.graphService.appendAudit({ tool: 'resolve_entity', input, output: result });
    return result;
  }

  @Tool({
    name: 'all_control_paths',
    description: 'Find all ownership paths between two entities via DFS traversal of owns_pct edges. Returns sourced evidence edges for each path. Deterministic, no LLM.',
    inputSchema: z.object({
      from: z.string().describe('Source entity ID (the suspected controller/UBO)'),
      to: z.string().optional().describe('Target entity ID (the company under investigation). If omitted, finds all reachable entities.'),
      max_depth: z.number().optional().default(6).describe('Maximum path depth'),
      min_edge_pct: z.number().optional().describe('Minimum ownership fraction per edge (0-1)'),
    }),
  })
  @Widget('evidence-graph')
  async allControlPathsTool(
    input: { from: string; to?: string; max_depth?: number; min_edge_pct?: number },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();

    if (!input.to) {
      return { error: 'Target entity ID (to) is required', paths: [] };
    }

    try {
      const paths = allControlPaths(graph, {
        from: input.from,
        to: input.to,
        maxDepth: input.max_depth ?? 6,
        minEdgePct: input.min_edge_pct,
      });
      const result = { paths };
      this.graphService.appendAudit({ tool: 'all_control_paths', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, paths: [] };
    }
  }

  @Tool({
    name: 'compute_control',
    description: 'Compute effective ownership control from a root entity to a target entity. Multiplies percentages along chains, sums parallel paths. Returns the ONLY source of on-screen percentages. Deterministic, no LLM.',
    inputSchema: z.object({
      root: z.string().describe('The company under investigation'),
      target: z.string().describe('The suspected UBO / controlling entity'),
    }),
  })
  async computeControlTool(
    input: { root: string; target: string },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();

    try {
      const paths = allControlPaths(graph, {
        from: input.target,
        to: input.root,
        maxDepth: 6,
      });

      const controlResult = computeControl(paths);

      const result = {
        effective_control: controlResult.effectiveControl,
        contributing_paths: controlResult.contributingPaths,
        threshold: 0.25,
        meets_threshold: controlResult.thresholdReached,
        explanation: controlResult.explanation,
      };

      this.graphService.appendAudit({ tool: 'compute_control', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, effective_control: 0, meets_threshold: false };
    }
  }

  @Tool({
    name: 'find_shared_attributes',
    description: 'Find entities that share a common attribute (director, address, agent, phone) with the given entity. Used to pivot investigative modality when direct ownership paths are thin.',
    inputSchema: z.object({
      entity_id: z.string().describe('Entity ID to find shared attributes for'),
      attribute: z.enum(['director', 'address', 'agent', 'phone']).optional().describe('Attribute type to check. If omitted, checks all types.'),
    }),
  })
  async findSharedAttributesTool(
    input: { entity_id: string; attribute?: 'director' | 'address' | 'agent' | 'phone' },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    try {
      const result = findSharedAttributes(graph, {
        entity_id: input.entity_id,
        attribute: input.attribute,
      });
      this.graphService.appendAudit({ tool: 'find_shared_attributes', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, links: [] };
    }
  }

  @Tool({
    name: 'co_consignee_links',
    description: 'Find trade co-consignee relationships for a given entity. Determines which other entities share shipments with the target entity via bill-of-lading records.',
    inputSchema: z.object({
      entity_id: z.string().describe('Entity ID to find co-consignee links for'),
    }),
  })
  async coConsigneeLinksTool(
    input: { entity_id: string },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    try {
      const result = coConsigneeLinks(graph, { entity_id: input.entity_id });
      this.graphService.appendAudit({ tool: 'co_consignee_links', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, links: [] };
    }
  }

  @Tool({
    name: 'score_evidence',
    description: 'Deterministically score evidence edges for confidence. Computes a weighted average of dataset quality, reliability tier, recency, completeness, and provenance. Returns the ONLY source of confidence numbers on screen.',
    inputSchema: z.object({
      edge_ids: z.array(z.string()).describe('Array of evidence edge IDs to score'),
    }),
  })
  async scoreEvidenceTool(
    input: { edge_ids: string[] },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    try {
      const scored: Array<{ id: string; score: number; level: string; explanation: string }> = [];
      for (const edgeId of input.edge_ids) {
        const edge = graph.getRelationship(edgeId);
        if (edge) {
          const result = scoreEvidence(edge);
          scored.push({ id: edgeId, score: result.score, level: result.level, explanation: result.explanation });
        }
      }
      const result = { scored };
      this.graphService.appendAudit({ tool: 'score_evidence', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, scored: [] };
    }
  }

  @Tool({
    name: 'match_sanctions',
    description: 'Deterministically match an entity against the loaded sanctions list. Uses Jaro-Winkler similarity on entity name against sanctioned names. Returns matches with scores and rationale.',
    inputSchema: z.object({
      entity_id: z.string().describe('Entity ID to check against sanctions lists'),
    }),
  })
  async matchSanctionsTool(
    input: { entity_id: string },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    try {
      const entity = graph.getEntity(input.entity_id);
      if (!entity) {
        return { matches: [], error: `Entity not found: ${input.entity_id}` };
      }
      const sanctionsList = this.graphService.getSanctionsList();
      const result = matchSanctions(entity.name, sanctionsList);
      this.graphService.appendAudit({ tool: 'match_sanctions', input, output: result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { matches: [], error: message };
    }
  }

  @Tool({
    name: 'assemble_dossier',
    description: 'Assemble a complete investigation dossier for a root-target pair. Combines control computation, evidence scoring, and sanctions matching into a single audit-ready report.',
    inputSchema: z.object({
      root: z.string().describe('The company under investigation (starting entity ID)'),
      target: z.string().describe('The suspected UBO / controlling entity (target entity ID)'),
    }),
  })
  async assembleDossierTool(
    input: { root: string; target: string },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    try {
      const sanctionsList = this.graphService.getSanctionsList();
      const entityEnt = graph.getEntity(input.target);
      if (!entityEnt) {
        return { error: `Entity not found: ${input.target}` };
      }

      const sanctionMatches = matchSanctions(entityEnt.name, sanctionsList);
      const dossier = assembleDossier(graph, {
        root: input.root,
        target: input.target,
      }, sanctionMatches);

      this.graphService.appendAudit({ tool: 'assemble_dossier', input, output: dossier });
      return dossier;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  }
}
