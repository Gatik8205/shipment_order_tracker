import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createShipment } from '../api/shipments.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const LIMITS = {
  title: 120,
  origin: 200,
  destination: 200,
  recipient: 120,
};

const FIELD_LABELS = {
  title: 'Title',
  origin: 'Origin',
  destination: 'Destination',
  recipient: 'Recipient',
};

export default function NewShipment() {
  const navigate = useNavigate();

  const [fields, setFields] = useState({
    title: '',
    origin: '',
    destination: '',
    recipient: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function setField(name, value) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const errors = {};
    for (const [key, max] of Object.entries(LIMITS)) {
      const val = fields[key].trim();
      if (!val) {
        errors[key] = `${FIELD_LABELS[key]} is required.`;
      } else if (fields[key].length > max) {
        errors[key] = `${FIELD_LABELS[key]} must be ${max} characters or fewer.`;
      }
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const created = await createShipment(fields);
      navigate(`/shipments/${created._id}`);
    } catch (err) {
      const res = err.response;
      // 422 with per-field errors
      if (res?.status === 422 && Array.isArray(res.data?.errors)) {
        const apiErrors = {};
        for (const { field, reason } of res.data.errors) {
          apiErrors[field] = reason;
        }
        setFieldErrors(apiErrors);
      } else {
        setServerError(res?.data?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>New Shipment</h1>

      <form onSubmit={handleSubmit} noValidate>
        {(['title', 'origin', 'destination', 'recipient']).map((key) => (
          <div key={key} style={{ marginBottom: '1rem' }}>
            <label htmlFor={key} style={{ display: 'block', marginBottom: 4 }}>
              {FIELD_LABELS[key]}
            </label>
            <input
              id={key}
              type="text"
              value={fields[key]}
              maxLength={LIMITS[key] + 1} /* allow typing one extra so the error fires */
              onChange={(e) => setField(key, e.target.value)}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              aria-describedby={fieldErrors[key] ? `${key}-error` : undefined}
            />
            {fieldErrors[key] && (
              <span id={`${key}-error`} role="alert" style={{ color: 'red', fontSize: '0.875rem' }}>
                {fieldErrors[key]}
              </span>
            )}
          </div>
        ))}

        {serverError && (
          <p role="alert" style={{ color: 'red', marginBottom: '1rem' }}>
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 1.25rem' }}
        >
          {submitting && <LoadingSpinner size={16} />}
          {submitting ? 'Creating…' : 'Create Shipment'}
        </button>
      </form>
    </div>
  );
}
