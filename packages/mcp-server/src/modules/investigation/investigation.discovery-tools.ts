import { ToolDecorator as Tool, ControllerDecorator as Controller, Widget, z, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';
import {
  findSharedAttributes,
  coConsigneeLinks,
  scoreEvidence,
} from '@bruteforce/core';

@Controller()
export class InvestigationDiscoveryTools {
  constructor(private readonly graphService: GraphService) {}

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
      const result = coConsigneeLinks(graph.toEvidenceGraph(), { entity_id: input.entity_id });
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
  @Widget('source-card')
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
}
