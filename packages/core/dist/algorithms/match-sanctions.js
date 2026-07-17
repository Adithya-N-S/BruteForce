import { jaroWinklerSimilarity, normalizeEntityName } from '../utils/index.js';
export function matchSanctions(entityName, sanctionsList, options) {
    const threshold = options?.threshold ?? 0.65;
    const normalizedEntityName = normalizeEntityName(entityName);
    const matches = [];
    for (const rawSanction of sanctionsList) {
        const sanction = rawSanction;
        const sanctionName = normalizeEntityName(sanction['name'] || '');
        if (!sanctionName)
            continue;
        const score = jaroWinklerSimilarity(normalizedEntityName, sanctionName);
        if (score >= threshold) {
            matches.push({
                sanction_id: sanction['id'] || `sanction-${matches.length}`,
                list: sanction['list'] || 'unknown',
                rationale: `Name similarity ${(score * 100).toFixed(0)}% between '${entityName}' and '${sanction['name'] || ''}'`,
                score,
            });
        }
    }
    matches.sort((a, b) => b.score - a.score);
    return { matches };
}
//# sourceMappingURL=match-sanctions.js.map