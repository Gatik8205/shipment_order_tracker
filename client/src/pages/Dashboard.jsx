import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShipments } from '../api/shipments.js';
import { getErrorMessage } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Pagination from '../components/Pagination.jsx';

const STATUSES = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
const LIMIT = 20;

/** Format an ISO date string to a readable local date. */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Dashboard() {
  const [status, setStatus] = useState('');   // '' means "all statuses"
  const [page, setPage]     = useState(1);
  const [list, setList]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let cancelled = false; // guard against setting state after unmount

    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const params = { page, limit: LIMIT };
        if (status) params.status = status;
        const res = await listShipments(params);
        if (!cancelled) {
          setList(res.data);
          setTotal(res.total);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [status, page]); // re-fetch whenever filter or page changes

  function handleStatusChange(e) {
    setStatus(e.target.value);
    setPage(1); // reset to first page when filter changes
  }

  return (
    <div>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>My Shipments</h2>
        <span style={{ flex: 1 }} />
        <Link to="/shipments/new">+ New Shipment</Link>
      </div>

      {/* ── Filter ── */}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="status-filter">Filter by status:&nbsp;</label>
        <select
          id="status-filter"
          value={status}
          onChange={handleStatusChange}
          disabled={loading}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* ── Loading indicator ── */}
      {loading && (
        <div style={{ margin: '2rem 0', textAlign: 'center' }}>
          <LoadingSpinner size={28} />
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <p role="alert" style={{ color: '#721c24' }}>{error}</p>
      )}

      {/* ── Table / empty states ── */}
      {!loading && !error && (
        list.length === 0 ? (
          status ? (
            // Filter is active but nothing matches
            <p>No shipments match the selected status.</p>
          ) : (
            // No shipments at all
            <p>
              You have no shipments yet.{' '}
              <Link to="/shipments/new">Create your first one.</Link>
            </p>
          )
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tracking ID', 'Title', 'Route', 'Status', 'Created'].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #ddd' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s._id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <Link to={`/shipments/${s._id}`}>{s.trackingId}</Link>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{s.title}</td>
                  <td style={{ padding: '6px 8px' }}>{s.origin} → {s.destination}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>{formatDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* ── Pagination (shown even while loading so controls don't jump) ── */}
      {!error && (
        <Pagination
          page={page}
          total={total}
          limit={LIMIT}
          onChange={setPage}
          disabled={loading}
        />
      )}
    </div>
  );
}
