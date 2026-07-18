import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const edgesPath = resolve(process.cwd(), 'seed', 'edges.json');

if (!existsSync(edgesPath)) {
  console.log(`Edge file not found at ${edgesPath}`);
  process.exit(0);
}

const raw = readFileSync(edgesPath, 'utf-8');
const edges: Array<Record<string, unknown>> = JSON.parse(raw);

const targetEdgeId = 'plt-e-002';
const targetEdge = edges.find(e => e.id === targetEdgeId);

if (!targetEdge) {
  console.log(`Edge ${targetEdgeId} not found — already removed or missing.`);
  process.exit(0);
}

console.log(`Removing edge ${targetEdgeId}: ${targetEdge.from} → ${targetEdge.to} (${targetEdge.type}, ${targetEdge.value})`);

const filtered = edges.filter(e => e.id !== targetEdgeId);
writeFileSync(edgesPath, JSON.stringify(filtered, null, 2), 'utf-8');

console.log(`Removed ${targetEdgeId}. ${filtered.length} edges remain.`);
