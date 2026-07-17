import { Injectable } from '@nitrostack/core';
import { GraphManager } from '@bruteforce/core';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

@Injectable()
export class GraphService {
  private readonly graphManager: GraphManager;
  private readonly sourceRecords: Map<string, unknown>;
  private readonly sanctionsList: unknown[];
  private readonly auditLog: Array<{
    timestamp: string;
    tool: string;
    input: unknown;
    output: unknown;
  }>;

  constructor() {
    this.graphManager = new GraphManager();
    this.sourceRecords = new Map();
    this.sanctionsList = [];
    this.auditLog = [];
    this.loadSeedData();
  }

  private getSeedPath(filename: string): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, '..', '..', '..', 'data', 'seed', filename);
  }

  private loadSeedData(): void {
    const entitiesPath = this.getSeedPath('entities.json');
    const edgesPath = this.getSeedPath('edges.json');
    const sourcesPath = this.getSeedPath('source_records.json');
    const sanctionsPath = this.getSeedPath('sanctions_list.json');

    const entities = JSON.parse(readFileSync(entitiesPath, 'utf-8'));
    const edges = JSON.parse(readFileSync(edgesPath, 'utf-8'));
    const sources = JSON.parse(readFileSync(sourcesPath, 'utf-8'));
    const sanctions = JSON.parse(readFileSync(sanctionsPath, 'utf-8'));

    for (const entity of entities) {
      try {
        this.graphManager.addEntity(entity);
      } catch (_) {}
    }

    for (const edge of edges) {
      try {
        this.graphManager.addRelationship(edge);
      } catch (_) {}
    }

    for (const record of sources) {
      this.sourceRecords.set(record.record_id, record);
    }

    if (Array.isArray(sanctions)) {
      this.sanctionsList.push(...sanctions);
    }
  }

  getGraph(): GraphManager {
    return this.graphManager;
  }

  getSourceRecord(recordId: string): unknown | undefined {
    return this.sourceRecords.get(recordId);
  }

  getAllSourceRecords(): unknown[] {
    return Array.from(this.sourceRecords.values());
  }

  getSanctionsList(): unknown[] {
    return this.sanctionsList;
  }

  appendAudit(entry: { tool: string; input: unknown; output: unknown }): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  getAuditLog(): unknown[] {
    return [...this.auditLog];
  }
}
