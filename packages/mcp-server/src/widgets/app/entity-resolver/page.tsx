'use client';

import { useWidgetSDK } from '@nitrostack/widgets';

export default function EntityResolver() {
  const { isReady, getToolOutput } = useWidgetSDK();

  if (!isReady) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading entity resolution results…</div>
      </div>
    );
  }

  const data: any = getToolOutput<any>();

  if (!data || typeof data !== 'object') {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>Waiting for tool output…</div>
      </div>
    );
  }

  const matches = data.matches || data.results || [];

  if (!Array.isArray(matches) || matches.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>No matching entities found.</div>
        <pre style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Entity Resolution Results</h2>
      <p style={styles.subtitle}>
        {matches.length} entit{matches.length === 1 ? 'y' : 'ies'} matched — scores based on Jaro-Winkler similarity
      </p>

      {matches.map((match: any, idx: number) => {
        const score = match.score ?? match.similarity ?? 0;
        const scorePct = (score * 100).toFixed(0);
        const scoreColor = score >= 0.85 ? '#4ade80' : score >= 0.65 ? '#facc15' : '#f87171';

        return (
          <div key={idx} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.entityId}>{match.entity_id || match.id || 'N/A'}</span>
              <span style={{ ...styles.scoreBadge, background: `${scoreColor}22`, color: scoreColor, borderColor: scoreColor }}>
                {scorePct}% Match
              </span>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.row}>
                <span style={styles.label}>Name:</span>
                <span style={styles.value}>{match.name || match.entity_name || match.matched_name || 'Unknown'}</span>
              </div>
              {match.type && (
                <div style={styles.row}>
                  <span style={styles.label}>Type:</span>
                  <span style={styles.value}>{match.type}</span>
                </div>
              )}
              {match.jurisdiction && (
                <div style={styles.row}>
                  <span style={styles.label}>Jurisdiction:</span>
                  <span style={styles.value}>{match.jurisdiction}</span>
                </div>
              )}
              {match.matched_features && Array.isArray(match.matched_features) && (
                <div style={styles.row}>
                  <span style={styles.label}>Matched:</span>
                  <span style={styles.value}>{match.matched_features.join(', ')}</span>
                </div>
              )}
              {match.rationale && (
                <div style={{ ...styles.row, marginTop: '0.25rem' }}>
                  <span style={{ ...styles.value, fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    {match.rationale}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: '1.25rem',
    maxWidth: 750,
    margin: '0 auto',
    color: '#e2e8f0',
    background: '#0f172a',
    borderRadius: 12,
    border: '1px solid #334155',
  },
  loading: {
    textAlign: 'center',
    padding: '1.5rem',
    color: '#94a3b8',
  },
  empty: {
    textAlign: 'center',
    padding: '1.5rem',
    color: '#64748b',
  },
  heading: {
    margin: '0 0 0.25rem',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  subtitle: {
    margin: '0 0 1rem',
    fontSize: '0.8125rem',
    color: '#94a3b8',
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    marginBottom: '0.75rem',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    background: '#0f172a',
    borderBottom: '1px solid #334155',
  },
  entityId: {
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#60a5fa',
  },
  scoreBadge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '0.2rem 0.5rem',
    borderRadius: 4,
    border: '1px solid',
  },
  cardBody: {
    padding: '0.75rem 1rem',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  label: {
    fontSize: '0.8125rem',
    color: '#64748b',
    minWidth: 100,
    flexShrink: 0,
  },
  value: {
    fontSize: '0.8125rem',
    color: '#e2e8f0',
  },
};
