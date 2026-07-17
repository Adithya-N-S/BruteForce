'use client';

import { useWidgetSDK } from '@nitrostack/widgets';

/**
 * EvidenceGraph widget — renders ownership paths returned by the
 * `all_control_paths` MCP tool as a visual node-and-edge graph.
 *
 * Data shape expected (matches all_control_paths tool output):
 *   { paths: Array<{ nodes: string[]; edges: Array<{ from; to; pct; ... }> }> }
 */
export default function EvidenceGraph() {
  const { isReady, getToolOutput } = useWidgetSDK();

  if (!isReady) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading evidence graph…</div>
      </div>
    );
  }

  const data = getToolOutput();

  if (!data || !data.paths || data.paths.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>No ownership paths found.</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Evidence Graph — Ownership Paths</h2>
      <p style={styles.subtitle}>
        {data.paths.length} path{data.paths.length !== 1 ? 's' : ''} found
      </p>

      {data.paths.map((path: any, pathIdx: number) => (
        <div key={pathIdx} style={styles.pathCard}>
          <div style={styles.pathHeader}>Path {pathIdx + 1}</div>
          <div style={styles.pathNodes}>
            {path.nodes?.map((nodeId: string, nodeIdx: number) => (
              <span key={nodeId} style={styles.nodeChain}>
                <span style={styles.node}>{nodeId}</span>
                {nodeIdx < (path.nodes?.length ?? 0) - 1 && (
                  <span style={styles.arrow}>
                    {path.edges?.[nodeIdx]
                      ? `—${(path.edges[nodeIdx].pct * 100).toFixed(0)}%→`
                      : '→'}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Inline styles (no external CSS deps needed) ── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: '1.5rem',
    maxWidth: 800,
    margin: '0 auto',
    color: '#e2e8f0',
    background: '#0f172a',
    borderRadius: 12,
    minHeight: 120,
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
  empty: {
    textAlign: 'center',
    padding: '2rem',
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
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  pathCard: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  pathHeader: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#64748b',
    marginBottom: '0.5rem',
  },
  pathNodes: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.25rem',
  },
  nodeChain: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  node: {
    display: 'inline-block',
    background: '#3b82f6',
    color: '#fff',
    padding: '0.25rem 0.625rem',
    borderRadius: 6,
    fontSize: '0.8125rem',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  arrow: {
    color: '#64748b',
    fontSize: '0.8125rem',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap' as const,
  },
};
