import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login as loginApi } from '../api/auth.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const errors = {};
    if (!email.trim()) errors.email = 'Email is required.';
    if (!password) errors.password = 'Password is required.';
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
      const { token, user } = await loginApi({ email, password });
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h1>Login</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && (
            <span id="email-error" role="alert" style={{ color: 'red', fontSize: '0.875rem' }}>
              {fieldErrors.email}
            </span>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: 4 }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          />
          {fieldErrors.password && (
            <span id="password-error" role="alert" style={{ color: 'red', fontSize: '0.875rem' }}>
              {fieldErrors.password}
            </span>
          )}
        </div>

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
          {submitting ? 'Logging in…' : 'Login'}
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        Don&apos;t have an account?{' '}
        <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}
