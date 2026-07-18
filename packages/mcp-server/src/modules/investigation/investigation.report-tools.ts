import { ToolDecorator as Tool, ControllerDecorator as Controller, Widget, z, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';
import {
  matchSanctions,
  assembleDossier,
} from '@bruteforce/core';

@Controller()
export class InvestigationReportTools {
  constructor(private readonly graphService: GraphService) {
    this.matchSanctionsTool = this.matchSanctionsTool.bind(this);
    this.assembleDossierTool = this.assembleDossierTool.bind(this);
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
  @Widget('dossier-view')
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
