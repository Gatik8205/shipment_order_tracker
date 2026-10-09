import StatusBadge from './StatusBadge.jsx';

/**
 * Timeline — vertical list of status-change events, oldest first.
 * Each entry shows: status label (badge), formatted time, actor name,
 * and an optional note.
 */
export default function Timeline({ history = [] }) {
  if (history.length === 0) {
    return <p className="timeline-empty">No history yet.</p>;
  }

  return (
    <ol className="timeline" aria-label="Shipment history">
      {history.map((entry, idx) => (
        <li key={idx} className="timeline-entry">
          <div className="timeline-marker" aria-hidden="true" />
          <div className="timeline-body">
            <div className="timeline-row">
              <StatusBadge status={entry.to} />
              <time className="timeline-time" dateTime={entry.at}>
                {formatTime(entry.at)}
              </time>
            </div>
            <span className="timeline-actor">by {entry.actor?.name ?? 'unknown'}</span>
            {entry.note && (
              <p className="timeline-note">{entry.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Format an ISO timestamp to a human-readable local string. */
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
