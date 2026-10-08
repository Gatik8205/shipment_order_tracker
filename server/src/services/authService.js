const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/ApiError');

const BCRYPT_COST = 10;
const JWT_EXPIRY = '24h';

/**
 * Register a new user account.
 *
 * - Email uniqueness is checked case-insensitively by querying the lowercased
 *   `email` field (the User model stores it lowercase via `lowercase: true`).
 * - A duplicate-key error on `email` (MongoDB code 11000) is also caught and
 *   mapped to 409 to guard against a TOCTOU race between the existence check
 *   and the insert.
 * - Password is hashed with bcryptjs at cost 10.
 * - Returns `{ token, user }` where `user` is the plain object without passwordHash.
 *
 * @param {{ name: string, email: string, password: string }} data - Already validated & normalised
 * @returns {Promise<{ token: string, user: object }>}
 */
async function register(data) {
  const { name, email, password } = data;

  // Case-insensitive duplicate check (email is stored lowercase, so a direct
  // equality query on the lowercased value is sufficient and index-friendly).
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    // Guard against a race where two concurrent registrations slip past the
    // findOne check above and one of them hits the unique index.
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      throw new ApiError(409, 'Email already registered');
    }
    throw err;
  }

  const token = _signToken(user._id);

  return { token, user: _publicUser(user) };
}

/**
 * Authenticate an existing user.
 *
 * Returns a generic 401 for both unknown email and wrong password — no
 * information is revealed about which field was wrong.
 *
 * @param {{ email: string, password: string }} data - Already validated & normalised
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(data) {
  const { email, password } = data;

  // Select passwordHash explicitly (select: false on the schema hides it by default)
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = _signToken(user._id);

  return { token, user: _publicUser(user) };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Sign a 24-hour JWT whose only claim (besides standard `iat`/`exp`) is `sub`
 * set to the user's string id. The role is intentionally excluded; it is
 * always read fresh from the DB by the auth middleware.
 *
 * @param {import('mongoose').Types.ObjectId} userId
 * @returns {string}
 */
function _signToken(userId) {
  return jwt.sign(
    { sub: userId.toString() },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Return a plain object safe to include in API responses.
 * Mirrors the shape the controller must send: `{ id, name, email, role }`.
 *
 * We derive this from the Mongoose document rather than relying solely on
 * `toJSON` so the shape is explicit and stable regardless of schema changes.
 *
 * @param {import('mongoose').Document} user
 * @returns {{ id: string, name: string, email: string, role: string }}
 */
function _publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

module.exports = { register, login };
