const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/ApiError');
const { JWT_SECRET } = require('../config/env');

/**
 * Authentication middleware.
 *
 * Expects `Authorization: Bearer <token>` on the request.
 *
 * On success:
 *   - Verifies the JWT signature and expiry.
 *   - Reads `sub` (user id) from the token payload.
 *   - Loads the user document from the database.
 *   - Attaches the DB user as `req.actor` (role comes from the DB, never the token).
 *
 * On failure (missing header, malformed token, expired token, user not found):
 *   - Calls next(ApiError(401, ...)) without leaking token contents.
 *
 * @type {import('express').RequestHandler}
 */
async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Must be present and start with "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const token = authHeader.slice(7); // strip "Bearer "

    // Verify signature and expiry; throws on any failure
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      // jwt.JsonWebTokenError, jwt.TokenExpiredError, jwt.NotBeforeError, etc.
      // Do not include the error message — it may reference token contents.
      return next(new ApiError(401, 'Invalid or expired token'));
    }

    const userId = payload.sub;
    if (!userId) {
      return next(new ApiError(401, 'Invalid or expired token'));
    }

    // Load the user from the database; role is always read from the DB, not the token
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(401, 'Invalid or expired token'));
    }

    req.actor = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = auth;
