/**
 * StatusBadge — coloured pill for a shipment status value.
 * Colours are defined inline so no CSS class lookup is needed at runtime.
 */

const STATUS_STYLES = {
  CREATED:    { background: '#e0f0ff', color: '#1565c0' },
  PICKED_UP:  { background: '#fff3cd', color: '#856404' },
  IN_TRANSIT: { background: '#d1ecf1', color: '#0c5460' },
  DELIVERED:  { background: '#d4edda', color: '#155724' },
  CANCELLED:  { background: '#f8d7da', color: '#721c24' },
};

const BASE_STYLE = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '12px',
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

export default function StatusBadge({ status }) {
  const extra = STATUS_STYLES[status] ?? { background: '#eee', color: '#333' };
  return (
    <span style={{ ...BASE_STYLE, ...extra }} aria-label={`Status: ${status}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
