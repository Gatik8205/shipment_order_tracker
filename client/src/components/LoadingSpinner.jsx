/**
 * LoadingSpinner — small inline animated ring.
 * Pure CSS animation via a <style> tag; no external dependency needed.
 */
export default function LoadingSpinner({ size = 18 }) {
  return (
    <>
      <style>{`
        @keyframes _spin {
          to { transform: rotate(360deg); }
        }
        .loading-spinner {
          display: inline-block;
          border: 2px solid var(--border, #e5e4e7);
          border-top-color: var(--accent, #aa3bff);
          border-radius: 50%;
          animation: _spin 0.7s linear infinite;
          vertical-align: middle;
          flex-shrink: 0;
        }
      `}</style>
      <span
        className="loading-spinner"
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
    </>
  );
}
