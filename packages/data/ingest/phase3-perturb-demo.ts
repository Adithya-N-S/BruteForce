/**
 * @fileoverview D4 Phase 3 — Evader perturbation demonstration.
 *
 * Prints the deterministic "re-route" moment: removes the single highest-stake
 * ownership edge on `ent_company_a` and shows the surviving graph plus the
 * confirmation that the shared-address alternate route (e4/e5) survives.
 *
 * PURE — no I/O, no LLM, no network. Exits non-zero if the perturbation contract
 * is violated (e.g. it ever removes more than one edge or injects a fact).
 */

import { plantedCaseGraph } from './phase3-planted-case.ts';
import { runDemoPerturbation, describePerturbation } from './evader-demo.ts';

function main(): void {
  const result = runDemoPerturbation(plantedCaseGraph.edges as any);

  console.log('=== D4 Phase 3 — Evader Perturbation (re-route moment) ===\n');
  console.log(describePerturbation(result));
  console.log(`\nRemoved edge id : ${result.removed.id}`);
  console.log(`Surviving edges : ${result.edges.length} (was ${plantedCaseGraph.edges.length})`);

  const sharedRouteStillPresent =
    result.edges.some((e) => e.id === 'e4') && result.edges.some((e) => e.id === 'e5');
  console.log(`Alt shared-address route (e4/e5) intact: ${sharedRouteStillPresent}`);

  if (result.edges.length !== plantedCaseGraph.edges.length - 1) {
    console.error('CONTRACT VIOLATION: perturbation removed != 1 edge.');
    process.exit(1);
  }
  if (!sharedRouteStillPresent) {
    console.error('CONTRACT VIOLATION: shared-address alternate route was severed.');
    process.exit(1);
  }
  console.log('\nPerturbation contract satisfied.');
}

main();
