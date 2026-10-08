const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { registerHandler, loginHandler, me } = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/auth.schemas');

const router = Router();

/**
 * Rate limiter applied to POST /register and POST /login only.
 *
 * Spec: 20 requests per 15 minutes per IP; HTTP 429 beyond that.
 * A custom handler ensures the 429 body is JSON and matches the API error
 * shape used everywhere else — express-rate-limit's default is plain text.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,                 // max requests per window per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many requests, please try again later' });
  },
});

// POST /api/auth/register — rate limited, body validated
router.post('/register', authLimiter, validate(registerSchema, 'body'), registerHandler);

// POST /api/auth/login — rate limited, body validated
router.post('/login', authLimiter, validate(loginSchema, 'body'), loginHandler);

// GET /api/auth/me — authenticated, not rate limited
router.get('/me', auth, me);

module.exports = router;
