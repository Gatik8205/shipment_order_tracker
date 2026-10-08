/**
 * ApiError – application-level HTTP error.
 *
 * @param {number} status   - HTTP status code (e.g. 404, 422, 409)
 * @param {string} message  - Human-readable message for the response body
 * @param {object} extra    - Optional extra fields merged onto the instance
 *                            (e.g. { errors: [...] } for 422,
 *                                   { allowed: [...] } for 409 transitions)
 */
class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.assign(this, extra);
  }
}

module.exports = { ApiError };
