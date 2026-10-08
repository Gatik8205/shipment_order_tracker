const { ApiError } = require('../utils/ApiError');

/**
 * Centralized Express error-handling middleware.
 *
 * - ApiError instances: use err.status, include err.allowed / err.errors if present.
 * - Malformed JSON bodies: HTTP 422 (all validation failures use 422).
 * - Unknown errors: logged server-side, HTTP 500 with a generic message.
 * - Stack trace: included in the body only when NODE_ENV !== 'production'.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // If a response has already started we cannot change it; defer to Express.
  if (res.headersSent) return next(err);

  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof ApiError) {
    const body = { message: err.message };

    // Extra fields copied onto the instance by ApiError (e.g. `errors` for 422,
    // `allowed` for 409 transitions)
    if (err.errors !== undefined) body.errors = err.errors;
    if (err.allowed !== undefined) body.allowed = err.allowed;

    if (!isProd) body.stack = err.stack;

    return res.status(err.status).json(body);
  }

  // express.json() throws this when the request body is not valid JSON
  if (err.type === 'entity.parse.failed') {
    return res.status(422).json({ message: 'Malformed JSON body' });
  }

  // Unknown / unexpected error: log it, but do not leak internals to the client
  console.error(err);
  const body = { message: 'An unexpected error occurred' };
  if (!isProd) body.stack = err.stack;

  return res.status(500).json(body);
}

module.exports = errorHandler;