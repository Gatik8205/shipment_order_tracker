const authService = require('../services/authService');

/**
 * POST /api/auth/register
 *
 * Reads validated body from req.validated.body (set by validate middleware).
 * Delegates all business logic to authService.register.
 * Responds 201 with { token, user: { id, name, email, role } }.
 */
async function registerHandler(req, res, next) {
  try {
    const result = await authService.register(req.validated.body);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Reads validated body from req.validated.body.
 * Delegates all business logic to authService.login.
 * Responds 200 with { token, user: { id, name, email, role } }.
 */
async function loginHandler(req, res, next) {
  try {
    const result = await authService.login(req.validated.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 *
 * Protected by auth middleware, which attaches the DB user as req.actor.
 * Returns the actor's profile — no service call needed.
 * Responds 200 with { id, name, email, role }.
 */
function me(req, res) {
  const { _id, name, email, role } = req.actor;
  return res.status(200).json({
    id: _id.toString(),
    name,
    email,
    role,
  });
}

module.exports = { registerHandler, loginHandler, me };
