'use client';

import { useWidgetSDK } from '@nitrostack/widgets';

export default function SourceCard() {
  const { isReady, getToolOutput } = useWidgetSDK();

  if (!isReady) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading evidence source details…</div>
      </div>
    );
  }

  const output: any = getToolOutput<any>();

  if (!output || (!output.scored && !output.id && !output.edge)) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>No source evidence record found.</div>
      </div>
    );
  }

  // Support array of scored edges or single edge/scored output
  const items: any[] = output.scored || (Array.isArray(output) ? output : [output]);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Evidence Source & Confidence Breakdown</h2>
      <p style={styles.subtitle}>
        Deterministic scoring based on dataset quality, reliability tier, recency & completeness
      </p>

      {items.map((item: any, idx: number) => {
        const edgeId = item.id || item.edge?.id || `edge-${idx}`;
        const score = item.score ?? item.scoreResult?.score ?? 0;
        const level = item.level || item.scoreResult?.level || (score >= 0.85 ? 'high' : score >= 0.65 ? 'medium' : 'low');
        const explanation = item.explanation || item.scoreResult?.explanation || 'Scored via evidence evaluation model.';

        const levelColor =
          level === 'high' ? '#4ade80' : level === 'medium' ? '#facc15' : '#f87171';

        return (
          <div key={idx} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.edgeBadge}>{edgeId}</span>
              <span style={{ ...styles.confidenceBadge, background: `${levelColor}22`, color: levelColor, borderColor: levelColor }}>
                {(score * 100).toFixed(0)}% Confidence ({level.toUpperCase()})
              </span>
            </div>
            <p style={styles.explanation}>{explanation}</p>
            {item.edge && (
              <div style={styles.provenanceBox}>
                <div style={styles.provRow}>
                  <span>Source Dataset:</span> <strong>{item.edge.source_dataset || 'ICIJ / Registry'}</strong>
                </div>
                <div style={styles.provRow}>
                  <span>Record ID:</span> <strong>{item.edge.record_id || 'N/A'}</strong>
                </div>
                <div style={styles.provRow}>
                  <span>Reliability Tier:</span> <strong>Tier {item.edge.reliability_tier || 1}</strong>
                </div>
              </div>
            )}
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
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  edgeBadge: {
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#60a5fa',
    background: '#0f172a',
    padding: '0.2rem 0.5rem',
    borderRadius: 4,
  },
  confidenceBadge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '0.2rem 0.5rem',
    borderRadius: 4,
    border: '1px solid',
  },
  explanation: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
    lineHeight: 1.4,
    margin: '0 0 0.75rem',
  },
  provenanceBox: {
    background: '#0f172a',
    padding: '0.625rem',
    borderRadius: 6,
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  provRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
};
