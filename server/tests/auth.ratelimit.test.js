'use strict';

/**
 * auth.ratelimit.test.js
 *
 * Kept in its own file on purpose: `node --test` runs each test file in a
 * separate process, so this file gets a fresh in-memory rate-limit counter.
 * That lets us assert the EXACT limit (20 requests per window), which is not
 * possible in auth.api.test.js because earlier tests there already spend part
 * of the same per-IP budget.
 */

// Env vars must be set BEFORE anything from src/ is required.
process.env.MONGO_URI = 'placeholder'; // replaced once the memory server starts
process.env.JWT_SECRET = 'test-secret-for-ratelimit-file';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mms;
let server;
let baseUrl;

before(async () => {
  mms = await MongoMemoryServer.create();
  process.env.MONGO_URI = mms.getUri();
  await mongoose.connect(process.env.MONGO_URI);

  const app = require('../src/app');
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mms.stop();
});

describe('Auth rate limiting (fresh counter)', () => {
  it('allows exactly 20 login attempts, then returns 429 JSON', async () => {
    const statuses = [];

    for (let i = 1; i <= 25; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `probe${i}@example.com`, password: 'irrelevant' }),
      });
      statuses.push(res.status);

      if (res.status === 429) {
        const body = await res.json();
        assert.equal(typeof body.message, 'string', '429 body must be JSON with a message');
      } else {
        await res.arrayBuffer(); // drain the body
      }
    }

    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(401), 'first 20 attempts are processed (401)');
    assert.deepEqual(statuses.slice(20), Array(5).fill(429), 'attempts 21 to 25 are rate limited (429)');
  });

  it('GET /api/auth/me and /api/health are not affected by the limiter', async () => {
    const me = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(me.status, 401); // unauthenticated, but NOT 429

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
  });
});
