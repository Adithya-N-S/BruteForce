'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

export default function DossierView() {
  const { isReady, getToolOutput } = useWidgetSDK();
  const theme = useTheme();

  if (!isReady) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading investigation dossier…</div>
      </div>
    );
  }

  const dossier: any = getToolOutput<any>();

  if (!dossier || dossier.error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          {dossier?.error || 'No dossier data available.'}
        </div>
      </div>
    );
  }

  // Handle both Dossier formats (legacy and comprehensive)
  const root = dossier.root || dossier.summary?.rootEntityId || 'N/A';
  const target = dossier.target || dossier.summary?.targetEntityId || 'N/A';
  const control = dossier.control || dossier.ownership || {};
  const effectiveControl = control.effective_control ?? control.effectiveControl ?? 0;
  const meetsThreshold = control.meets_threshold ?? control.meetsThreshold ?? false;
  const sanctions = dossier.sanctions?.matches || dossier.summary?.entityResolutionMatches || [];
  const confidence = dossier.evidence_confidence || dossier.confidenceSummary || {};
  const recommendations = dossier.recommendations || {};

  const isDark = theme === 'dark' || true; // dark theme default for investigation dashboard

  return (
    <div style={{ ...styles.container, background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a' }}>
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>Investigation Dossier</span>
          <h1 style={styles.title}>Audit Report & SAR View</h1>
        </div>
        <div style={{ ...styles.statusBadge, background: meetsThreshold ? '#15803d' : '#334155' }}>
          {meetsThreshold ? 'UBO THRESHOLD EXCEEDED' : 'BELOW THRESHOLD'}
        </div>
      </div>

      {/* Overview Grid */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Target Entity (Under Investigation)</div>
          <div style={styles.cardValue}>{root}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Suspected Controller / UBO</div>
          <div style={styles.cardValue}>{target}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Effective Ownership Control</div>
          <div style={{ ...styles.cardValue, color: meetsThreshold ? '#4ade80' : '#60a5fa' }}>
            {(effectiveControl * 100).toFixed(1)}%
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Aggregate Confidence</div>
          <div style={styles.cardValue}>
            {confidence.aggregate_confidence !== undefined
              ? `${(confidence.aggregate_confidence * 100).toFixed(0)}% (${confidence.confidenceLevel || 'Evaluated'})`
              : 'Evaluated'}
          </div>
        </div>
      </div>

      {/* Recommendations & Rationale */}
      {recommendations.rationale && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Compliance Rationale & Recommendations</h3>
          <p style={styles.text}>{recommendations.rationale}</p>
          {recommendations.actions && (
            <ul style={styles.actionList}>
              {recommendations.actions.map((act: string, idx: number) => (
                <li key={idx} style={styles.actionItem}>⚡ {act}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sanctions Exposure */}
      {sanctions.length > 0 && (
        <div style={{ ...styles.section, borderColor: '#ef4444' }}>
          <h3 style={{ ...styles.sectionTitle, color: '#f87171' }}>Sanctions Exposure & Watchlist Hits</h3>
          {sanctions.map((match: any, idx: number) => (
            <div key={idx} style={styles.sanctionCard}>
              <div style={{ fontWeight: 600, color: '#fca5a5' }}>
                {match.name || match.matched_name || 'Sanction Hit'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                Score: {match.score ? (match.score * 100).toFixed(0) : 'N/A'}% | Rationale: {match.rationale || match.matched_features?.join(', ') || 'Direct match'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Control Paths */}
      {control.contributing_paths && control.contributing_paths.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Contributing Ownership Paths ({control.contributing_paths.length})</h3>
          {control.contributing_paths.map((pathObj: any, idx: number) => (
            <div key={idx} style={styles.pathRow}>
              <span style={styles.pathIndex}>Path {idx + 1}:</span>
              <span>{pathObj.path_string || pathObj.nodes?.join(' → ') || 'Ownership Chain'}</span>
              <span style={styles.pathPct}>
                ({((pathObj.effective_ownership || pathObj.effectiveOwnership || 0) * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: '1.5rem',
    maxWidth: 850,
    margin: '0 auto',
    borderRadius: 12,
    border: '1px solid #334155',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#94a3b8',
  },
  error: {
    textAlign: 'center',
    padding: '2rem',
    color: '#f87171',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    borderBottom: '1px solid #334155',
    paddingBottom: '1rem',
  },
  badge: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#60a5fa',
    fontWeight: 600,
  },
  title: {
    margin: '0.25rem 0 0',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  statusBadge: {
    padding: '0.375rem 0.75rem',
    borderRadius: 6,
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.05em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  card: {
    background: '#1e293b',
    padding: '1rem',
    borderRadius: 8,
    border: '1px solid #334155',
  },
  cardLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginBottom: '0.375rem',
  },
  cardValue: {
    fontSize: '1.125rem',
    fontWeight: 700,
  },
  section: {
    background: '#1e293b',
    padding: '1.25rem',
    borderRadius: 8,
    border: '1px solid #334155',
    marginBottom: '1.25rem',
  },
  sectionTitle: {
    margin: '0 0 0.75rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  text: {
    margin: '0 0 0.75rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: '#cbd5e1',
  },
  actionList: {
    margin: 0,
    paddingLeft: '1rem',
    fontSize: '0.875rem',
    color: '#60a5fa',
  },
  actionItem: {
    marginBottom: '0.375rem',
  },
  sanctionCard: {
    background: '#451a1a',
    padding: '0.75rem',
    borderRadius: 6,
    marginBottom: '0.5rem',
    border: '1px solid #7f1d1d',
  },
  pathRow: {
    fontSize: '0.875rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid #334155',
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  pathIndex: {
    fontWeight: 600,
    color: '#94a3b8',
  },
  pathPct: {
    color: '#4ade80',
    fontFamily: 'monospace',
    fontWeight: 600,
    marginLeft: 'auto',
  },
};
