const { ApiError } = require('../utils/ApiError');

/**
 * Factory that returns an Express middleware enforcing a minimum role.
 *
 * Must be used after the `auth` middleware, which attaches `req.actor`.
 * The role is always read from `req.actor` (i.e. the database), never
 * from the JWT payload.
 *
 * Returns 403 when `req.actor.role !== role`.
 *
 * @param {'admin'|'user'} role - Required role string
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.delete('/:id', auth, requireRole('admin'), handler);
 */
function requireRole(role) {
  return function roleMiddleware(req, res, next) {
    if (req.actor && req.actor.role === role) {
      return next();
    }
    return next(new ApiError(403, 'Forbidden'));
  };
}

module.exports = requireRole;
