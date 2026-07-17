import { jaroWinklerSimilarity, normalizeEntityName } from '../utils/index.js';
import type { MatchSanctionsResult, SanctionMatch } from '../types.js';

export interface MatchSanctionsOptions {
  threshold?: number;
}

export function matchSanctions(
  entityName: string,
  sanctionsList: unknown[],
  options?: MatchSanctionsOptions
): MatchSanctionsResult {
  const threshold = options?.threshold ?? 0.65;
  const normalizedEntityName = normalizeEntityName(entityName);
  const matches: SanctionMatch[] = [];

  for (const rawSanction of sanctionsList) {
    const sanction = rawSanction as Record<string, unknown>;
    const sanctionName = normalizeEntityName((sanction['name'] as string) || '');
    if (!sanctionName) continue;
    const score = jaroWinklerSimilarity(normalizedEntityName, sanctionName);
    if (score >= threshold) {
      matches.push({
        sanction_id: (sanction['id'] as string) || `sanction-${matches.length}`,
        list: (sanction['list'] as string) || 'unknown',
        rationale: `Name similarity ${(score * 100).toFixed(0)}% between '${entityName}' and '${(sanction['name'] as string) || ''}'`,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return { matches };
}
