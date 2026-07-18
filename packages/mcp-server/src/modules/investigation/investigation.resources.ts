import { ResourceDecorator as Resource, ControllerDecorator as Controller, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';

@Controller()
export class InvestigationResources {
  constructor(private readonly graphService: GraphService) {
    this.getEvidenceGraph = this.getEvidenceGraph.bind(this);
    this.getSourceRecord = this.getSourceRecord.bind(this);
    this.getAuditLog = this.getAuditLog.bind(this);
    this.getSanctionsList = this.getSanctionsList.bind(this);
  }

  @Resource({
    uri: 'bruteforce://graph/evidence',
    name: 'Evidence Graph',
    description: 'The full evidence graph containing all entities and sourced edges. Read-only snapshot of the current investigation state.',
    mimeType: 'application/json',
  })
  async getEvidenceGraph(uri: string, ctx: ExecutionContext) {
    const graph = this.graphService.getGraph();
    const evidenceGraph = graph.toEvidenceGraph();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          node_count: evidenceGraph.nodes.length,
          edge_count: evidenceGraph.edges.length,
          nodes: evidenceGraph.nodes,
          edges: evidenceGraph.edges,
        }, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'bruteforce://source/{record_id}',
    name: 'Source Record',
    description: 'Retrieve the raw source record that backs a specific evidence edge. Provides full provenance for audit.',
    mimeType: 'application/json',
  })
  async getSourceRecord(uri: string, ctx: ExecutionContext) {
    const recordId = uri.replace('bruteforce://source/', '');
    const record = this.graphService.getSourceRecord(recordId);
    if (!record) {
      throw new Error(`Source record not found: ${recordId}`);
    }
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(record, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'bruteforce://audit/log',
    name: 'Audit Log',
    description: 'Append-only audit log of all tool calls made during the investigation. Enables deterministic replay.',
    mimeType: 'application/json',
  })
  async getAuditLog(uri: string, ctx: ExecutionContext) {
    const log = this.graphService.getAuditLog();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ entries: log, count: log.length }, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'bruteforce://data/sanctions',
    name: 'Sanctions List',
    description: 'The loaded sanctions and PEP entries list used for entity matching.',
    mimeType: 'application/json',
  })
  async getSanctionsList(uri: string, ctx: ExecutionContext) {
    const list = this.graphService.getSanctionsList();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ entries: list, count: list.length }, null, 2),
      }],
    };
  }
}
