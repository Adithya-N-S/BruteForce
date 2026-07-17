'use client';

import { useState, useEffect } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';

interface LogEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: any;
}

export default function PlannerLog() {
  const { isReady, getToolOutput } = useWidgetSDK();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('default-session');

  const output: any = isReady ? getToolOutput<any>() : null;

  useEffect(() => {
    const activeSessionId = output?.sessionId || output?.id || sessionId;
    setSessionId(activeSessionId);

    // Orchestrator SSE Stream endpoint (default port 3002 or relative)
    const streamUrl = output?.streamUrl || `http://localhost:3002/stream/${activeSessionId}`;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setConnected(true);
      };

      const handleEvent = (type: string) => (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          setLogs(prev => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              type,
              timestamp: new Date().toLocaleTimeString(),
              payload,
            },
          ]);
        } catch (e) {
          // Fallback if raw string
          setLogs(prev => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              type,
              timestamp: new Date().toLocaleTimeString(),
              payload: event.data,
            },
          ]);
        }
      };

      eventSource.addEventListener('planner_decision', handleEvent('planner_decision'));
      eventSource.addEventListener('tool_result', handleEvent('tool_result'));
      eventSource.addEventListener('edge_found', handleEvent('edge_found'));

      eventSource.onerror = () => {
        setConnected(false);
      };
    } catch (e) {
      setConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [output]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>Planner Log — SSE Action Stream</h2>
          <span style={styles.sessionText}>Session: {sessionId}</span>
        </div>
        <div style={{ ...styles.statusDot, background: connected ? '#4ade80' : '#f87171' }}>
          {connected ? 'LIVE STREAMING' : 'DISCONNECTED / IDLE'}
        </div>
      </div>

      <div style={styles.terminal}>
        {logs.length === 0 ? (
          <div style={styles.terminalEmpty}>
            Waiting for planner decisions, tool results, and evidence graph events…
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} style={styles.logLine}>
              <span style={styles.timestamp}>[{log.timestamp}]</span>
              <span
                style={{
                  ...styles.eventType,
                  color:
                    log.type === 'planner_decision'
                      ? '#60a5fa'
                      : log.type === 'edge_found'
                      ? '#4ade80'
                      : '#facc15',
                }}
              >
                [{log.type.toUpperCase()}]
              </span>
              <pre style={styles.payload}>
                {typeof log.payload === 'object'
                  ? JSON.stringify(log.payload, null, 2)
                  : String(log.payload)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: '1.25rem',
    maxWidth: 850,
    margin: '0 auto',
    color: '#e2e8f0',
    background: '#0f172a',
    borderRadius: 12,
    border: '1px solid #334155',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  heading: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  sessionText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  statusDot: {
    padding: '0.25rem 0.625rem',
    borderRadius: 6,
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '0.05em',
  },
  terminal: {
    background: '#020617',
    border: '1px solid #1e293b',
    borderRadius: 8,
    padding: '1rem',
    maxHeight: 400,
    overflowY: 'auto',
    fontFamily: "'Fira Code', 'Courier New', monospace",
    fontSize: '0.8125rem',
  },
  terminalEmpty: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  logLine: {
    marginBottom: '0.75rem',
    borderBottom: '1px dashed #1e293b',
    paddingBottom: '0.5rem',
  },
  timestamp: {
    color: '#64748b',
    marginRight: '0.5rem',
  },
  eventType: {
    fontWeight: 700,
    marginRight: '0.5rem',
  },
  payload: {
    margin: '0.25rem 0 0',
    color: '#cbd5e1',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
};
