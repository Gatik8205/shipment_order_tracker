'use strict';

/**
 * auth.api.test.js
 *
 * Integration tests for all auth endpoints.
 * Uses node:test + built-in fetch (Node 22).
 * Uses MongoMemoryServer — no real DB required.
 *
 * IMPORTANT: env vars must be set BEFORE any require of src/ so that
 * config/env.js does not throw "Missing required environment variables".
 * dotenv.config() in config/env.js will run but will not overwrite vars
 * that are already set (process.env takes priority over .env when
 * dotenv is called without { override: true }).
 */

// ── 1. ENV SETUP (must be first, before any src/ require) ─────────────────
process.env.MONGO_URI     = 'placeholder';   // overwritten after MMS starts
process.env.JWT_SECRET    = 'test-secret-for-auth-tests';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV      = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');  

// ── 2. GLOBALS ─────────────────────────────────────────────────────────────
let mms;        // MongoMemoryServer instance
let server;     // http.Server from app.listen(0)
let baseUrl;    // e.g. http://127.0.0.1:PORT

// ── 3. HELPERS ──────────────────────────────────────────────────────────────
function url(path) { return `${baseUrl}${path}`; }

async function post(path, body, headers = {}) {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function get(path, headers = {}) {
  return fetch(url(path), { headers });
}

// ── 4. LIFECYCLE ────────────────────────────────────────────────────────────
before(async () => {
  mms = await MongoMemoryServer.create();
  const uri = mms.getUri();

  // Overwrite the placeholder so when config/env.js module is first required
  // (inside app.js require chain) it reads the real URI.
  process.env.MONGO_URI = uri;

  await mongoose.connect(uri);

  // Require app AFTER env vars are set so config/env.js validation passes.
  const app = require('../src/app');

  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mms.stop();
});

// ── 5. TESTS ─────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 {status:"ok"}', async () => {
    const res = await get('/api/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });
});

describe('POST /api/auth/register', () => {
  it('valid user → 201 with token and user{id,name,email,role:"user"}; no passwordHash', async () => {
    const res = await post('/api/auth/register', {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });
    assert.equal(res.status, 201);
    const body = await res.json();

    assert.ok(typeof body.token === 'string', 'token must be a string');
    assert.ok(body.user, 'user must be present');
    assert.ok(typeof body.user.id === 'string', 'user.id must be a string');
    assert.equal(body.user.name, 'Alice');
    assert.equal(body.user.email, 'alice@example.com');
    assert.equal(body.user.role, 'user');

    // No passwordHash anywhere in the response
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('passwordHash'), 'response must not contain passwordHash');
  });

  it('duplicate email (different case) → 409 "Email already registered"', async () => {
    // alice@example.com already exists from previous test
    const res = await post('/api/auth/register', {
      name: 'Alice2',
      email: 'ALICE@EXAMPLE.COM',
      password: 'password123',
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.message, 'Email already registered');
  });

  it('extra field role:"admin" is ignored → 201 and role is "user"', async () => {
    const res = await post('/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
      role: 'admin',
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.user.role, 'user', 'role must always be "user" on register');
  });

  it('bad email, short password, empty name → 422 with errors array of {field,reason}', async () => {
    const res = await post('/api/auth/register', {
      name: '',
      email: 'not-an-email',
      password: 'short',
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(Array.isArray(body.errors), 'errors must be an array');
    assert.ok(body.errors.length > 0, 'errors must not be empty');
    for (const e of body.errors) {
      assert.ok('field' in e, 'each error must have a field');
      assert.ok('reason' in e, 'each error must have a reason');
    }
  });

  it('empty body {} → 422', async () => {
    const res = await post('/api/auth/register', {});
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(Array.isArray(body.errors));
  });
});

describe('POST /api/auth/login', () => {
  it('valid credentials → 200 with token', async () => {
    const res = await post('/api/auth/login', {
      email: 'alice@example.com',
      password: 'password123',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.token === 'string');
    assert.ok(body.user);
  });

  it('email in different case → 200', async () => {
    const res = await post('/api/auth/login', {
      email: 'ALICE@EXAMPLE.COM',
      password: 'password123',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.token === 'string');
  });

  it('wrong password → 401 with message', async () => {
    const res = await post('/api/auth/login', {
      email: 'alice@example.com',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(typeof body.message === 'string');
    // Store message for identical-message check
  });

  it('wrong password and unknown email return identical messages', async () => {
    const [r1, r2] = await Promise.all([
      post('/api/auth/login', { email: 'alice@example.com', password: 'wrong' }),
      post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever' }),
    ]);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(b1.message, b2.message, 'wrong-password and unknown-email must return the same message');
  });
});

describe('GET /api/auth/me', () => {
  let aliceToken;

  before(async () => {
    const res = await post('/api/auth/login', {
      email: 'alice@example.com',
      password: 'password123',
    });
    const body = await res.json();
    aliceToken = body.token;
  });

  it('valid token → 200 {id,name,email,role}', async () => {
    const res = await get('/api/auth/me', { Authorization: `Bearer ${aliceToken}` });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.id === 'string');
    assert.ok(typeof body.name === 'string');
    assert.ok(typeof body.email === 'string');
    assert.ok(typeof body.role === 'string');
  });

  it('no token → 401', async () => {
    const res = await get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('"Bearer garbage" → 401', async () => {
    const res = await get('/api/auth/me', { Authorization: 'Bearer garbage.token.here' });
    assert.equal(res.status, 401);
  });

  it('token for deleted user → 401', async () => {
    // Register a temp user, capture their token, delete them, then try /me
    const regRes = await post('/api/auth/register', {
      name: 'Temp',
      email: 'temp@example.com',
      password: 'password123',
    });
    const { token, user } = await regRes.json();

    // Delete the user directly via mongoose
    const User = require('../src/models/User');
    await User.findByIdAndDelete(user.id);

    const res = await get('/api/auth/me', { Authorization: `Bearer ${token}` });
    assert.equal(res.status, 401);
  });
  it('expired token → 401', async () => {
  const { sub } = jwt.decode(aliceToken);
  const expired = jwt.sign({ sub }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await get('/api/auth/me', { Authorization: `Bearer ${expired}` });
  assert.equal(res.status, 401);
});

it('token signed with a different secret → 401', async () => {
  const { sub } = jwt.decode(aliceToken);
  const forged = jwt.sign({ sub }, 'some-other-secret', { expiresIn: '1h' });
  const res = await get('/api/auth/me', { Authorization: `Bearer ${forged}` });
  assert.equal(res.status, 401);
});
});

describe('Edge cases', () => {
  it('POST /api/auth/register with invalid JSON body → 422 "Malformed JSON body"', async () => {
    const res = await fetch(url('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "name": "bad json",',   // intentionally malformed
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Malformed JSON body');
  });

  it('GET /api/nope → 404 JSON {message:"Not found"}', async () => {
    const res = await get('/api/nope');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.message, 'Not found');
  });
});
