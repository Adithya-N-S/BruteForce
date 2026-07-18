import { ToolDecorator as Tool, ControllerDecorator as Controller, Widget, z, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';
import {
  resolveEntity,
  allControlPaths,
  computeControl,
} from '@bruteforce/core';

@Controller()
export class InvestigationTools {
  constructor(private readonly graphService: GraphService) {
    this.resolveEntityTool = this.resolveEntityTool.bind(this);
    this.allControlPathsTool = this.allControlPathsTool.bind(this);
    this.computeControlTool = this.computeControlTool.bind(this);
  }

  @Tool({
    name: 'resolve_entity',
    description: 'Deterministic entity resolution using blocking + Jaro-Winkler similarity. Returns scored matches with matched features. No LLM involved.',
    inputSchema: z.object({
      name: z.string().optional().describe('Entity name to search for'),
      jurisdiction: z.string().optional().describe('Jurisdiction filter (e.g. BVI, UK, RU)'),
      identifiers: z.array(z.string()).optional().describe('Known identifiers to match against'),
    }),
  })
  @Widget('entity-resolver')
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
      const rawPaths = allControlPaths(graph, {
        from: input.from,
        to: input.to,
        maxDepth: input.max_depth ?? 6,
        minEdgePct: input.min_edge_pct,
      });
      const paths = rawPaths.map(p => {
        const nodes = [input.from, ...p.path.map(edge => edge.to)];
        const edges = p.path.map((edge, i) => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          pct: p.percentages[i] ?? edge.value ?? 0,
          type: edge.type,
          source_dataset: edge.source_dataset,
          record_id: edge.record_id,
        }));
        return { nodes, edges, metadata: p.metadata };
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
}
