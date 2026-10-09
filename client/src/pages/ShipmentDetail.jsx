import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getShipment, changeShipmentStatus } from '../api/shipments.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Timeline from '../components/Timeline.jsx';

export default function ShipmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [shipment, setShipment]   = useState(null);
  const [loadError, setLoadError] = useState('');   // initial-load error
  const [fetching, setFetching]   = useState(true); // true during initial fetch

  const [note, setNote]           = useState('');
  const [changing, setChanging]   = useState(false); // true while status change in flight
  const [changeError, setChangeError] = useState('');

  /** Fetch (or re-fetch) the shipment. */
  async function fetchShipment() {
    setFetching(true);
    try {
      const data = await getShipment(id);
      setShipment(data);
      setLoadError('');
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    fetchShipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Advance status; re-fetches on success. */
  async function handleStatusChange(toStatus) {
    setChanging(true);
    setChangeError('');
    try {
      await changeShipmentStatus(id, { to: toStatus, note: note.trim() || undefined });
      setNote('');
      await fetchShipment(); // refresh timeline + allowed list
    } catch (err) {
      setChangeError(getErrorMessage(err));
    } finally {
      setChanging(false);
    }
  }

  /* ── Loading state ── */
  if (fetching) {
    return (
      <div className="detail-loading" aria-live="polite">
        <LoadingSpinner size={24} /> Loading shipment…
      </div>
    );
  }

  /* ── Initial fetch failed: show error only, no timeline or controls ── */
  if (loadError) {
    return (
      <div className="detail-error" role="alert">
        <p>{loadError}</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }

  /* ── Determine which action buttons to show ── */
  const isAdmin = user?.role === 'admin';

  /*
   * Admins see one button per status listed in shipment.allowed.
   * Regular users only see Cancel if the shipment is CREATED.
   * Never hardcode the lifecycle — only shipment.allowed drives admin options.
   */
  const actionStatuses = isAdmin
    ? (shipment.allowed ?? [])
    : shipment.status === 'CREATED'
      ? ['CANCELLED']
      : [];

  const controlsDisabled = changing;

  return (
    <article className="detail-page">
      {/* ── Meta ── */}
      <header className="detail-header">
        <h2 className="detail-title">{shipment.title}</h2>
        <div className="detail-meta">
          <span className="detail-label">Tracking ID</span>
          <code className="detail-tracking">{shipment.trackingId}</code>
          <StatusBadge status={shipment.status} />
        </div>
        <dl className="detail-fields">
          <div className="detail-field">
            <dt>Origin</dt>
            <dd>{shipment.origin}</dd>
          </div>
          <div className="detail-field">
            <dt>Destination</dt>
            <dd>{shipment.destination}</dd>
          </div>
          <div className="detail-field">
            <dt>Recipient</dt>
            <dd>{shipment.recipient}</dd>
          </div>
        </dl>
      </header>

      {/* ── Timeline ── */}
      <section className="detail-section">
        <h3>History</h3>
        <Timeline history={shipment.history} />
      </section>

      {/* ── Status change controls (only when there are valid actions) ── */}
      {actionStatuses.length > 0 && (
        <section className="detail-section detail-controls" aria-label="Change status">
          <h3>Change Status</h3>

          {/* Inline error from a failed status change */}
          {changeError && (
            <p className="detail-change-error" role="alert">{changeError}</p>
          )}

          <div className="detail-controls-row">
            {/* Optional note input */}
            <input
              className="detail-note-input"
              type="text"
              placeholder="Add a note (optional)"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={controlsDisabled}
              aria-label="Status change note"
            />

            {/* One button per allowed status */}
            <div className="detail-action-buttons">
              {actionStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="detail-action-btn"
                  onClick={() => handleStatusChange(s)}
                  disabled={controlsDisabled}
                >
                  {changing ? <LoadingSpinner size={14} /> : null}
                  {' '}{s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
