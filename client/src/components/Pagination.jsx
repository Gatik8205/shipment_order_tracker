/**
 * Pagination — Previous/Next controls with a page indicator.
 *
 * Props:
 *   page     – current 1-based page number
 *   total    – total number of items across all pages
 *   limit    – items per page
 *   onChange – called with the new page number when user navigates
 *   disabled – disables both buttons (e.g. while a fetch is in flight)
 */
export default function Pagination({ page, total, limit, onChange, disabled }) {
  // Always show at least 1 page even when total is 0.
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
      >
        Previous
      </button>

      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}
