'use strict';

/**
 * shipments.api.test.js
 *
 * Integration tests for all shipment endpoints.
 * Uses node:test + built-in fetch (Node 22).
 * Uses MongoMemoryServer — no real DB required.
 *
 * IMPORTANT: env vars must be set BEFORE any require of src/ so that
 * config/env.js does not throw "Missing required environment variables".
 */

// ── 1. ENV SETUP (must be first, before any src/ require) ─────────────────
process.env.MONGO_URI     = 'placeholder';
process.env.JWT_SECRET    = 'test-secret-for-shipment-tests';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV      = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ── 2. GLOBALS ─────────────────────────────────────────────────────────────
let mms;      // MongoMemoryServer instance
let server;   // http.Server from app.listen(0)
let baseUrl;  // e.g. http://127.0.0.1:PORT

// User tokens and ids, set up in the top-level before()
let aliceToken;
let bobToken;
let carolToken; // carol is promoted to admin
let aliceId;
let bobId;
let carolId;

// ── 3. HELPERS ──────────────────────────────────────────────────────────────
function url(path) { return `${baseUrl}${path}`; }

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url(path), { headers });
}

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url(path), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

/** Register a user via the API and return { token, id }. */
async function registerUser(name, email, password = 'password123') {
  const res = await post('/api/auth/register', { name, email, password });
  if (res.status !== 201) {
    const body = await res.json();
    throw new Error(`Failed to register ${name}: ${JSON.stringify(body)}`);
  }
  const body = await res.json();
  return { token: body.token, id: body.user.id };
}

/** Login and return token. */
async function loginUser(email, password = 'password123') {
  const res = await post('/api/auth/login', { email, password });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

/**
 * Create a shipment via the API.
 * Returns the parsed response body (expects 201).
 */
async function createShipment(token, overrides = {}) {
  const payload = {
    title: 'Test Package',
    origin: 'Warehouse A',
    destination: 'Customer B',
    recipient: 'John Doe',
    ...overrides,
  };
  const res = await post('/api/shipments', payload, token);
  const body = await res.json();
  if (res.status !== 201) throw new Error(`createShipment failed: ${JSON.stringify(body)}`);
  return body;
}

/**
 * Move a shipment to a new status.
 * Returns { res, body }.
 */
async function changeStatus(shipmentId, to, token, note) {
  const payload = { to };
  if (note !== undefined) payload.note = note;
  const res = await post(`/api/shipments/${shipmentId}/status`, payload, token);
  const body = await res.json();
  return { res, body };
}

// ── 4. LIFECYCLE ────────────────────────────────────────────────────────────
before(async () => {
  mms = await MongoMemoryServer.create();
  const uri = mms.getUri();
  process.env.MONGO_URI = uri;

  await mongoose.connect(uri);

  // Require app and User model AFTER env vars and mongoose connection are ready.
  // We load User directly to promote carol to admin.
  const app = require('../src/app');
  const User = require('../src/models/User');

  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  // Register alice, bob, carol
  ({ token: aliceToken, id: aliceId } = await registerUser('alice', 'alice@example.com'));
  ({ token: bobToken, id: bobId }     = await registerUser('bob',   'bob@example.com'));
  ({ token: carolToken, id: carolId } = await registerUser('carol', 'carol@example.com'));

  // Promote carol to admin directly via the model
  await User.findByIdAndUpdate(carolId, { role: 'admin' });

  // Re-login carol to get a fresh token (role comes from DB; token doesn't carry role,
  // so carol's existing token will still work — but re-login is cleaner for test clarity)
  carolToken = await loginUser('carol@example.com');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mms.stop();
});

// ── 5. TESTS ─────────────────────────────────────────────────────────────────

// ── 5.1 Create shipment ──────────────────────────────────────────────────────
describe('POST /api/shipments — create', () => {
  it('alice creates a shipment → 201, status CREATED, valid trackingId, history[0] {from:null, actor.name:alice}', async () => {
    const body = await createShipment(aliceToken);

    assert.equal(body.status, 'CREATED');
    assert.match(body.trackingId, /^TRK-[0-9A-F]{10}$/);

    assert.ok(Array.isArray(body.history), 'history must be an array');
    assert.equal(body.history.length, 1, 'history must have exactly one entry on creation');

    const entry = body.history[0];
    assert.equal(entry.from, null, 'first history entry from must be null');
    assert.equal(entry.to, 'CREATED');
    assert.ok(entry.actor, 'history entry must have actor');
    assert.equal(entry.actor.name, 'alice', 'actor name must be alice');
    assert.ok(typeof entry.actor.id === 'string', 'actor.id must be a string');
  });

  it('no token → 401', async () => {
    const res = await post('/api/shipments', {
      title: 'X', origin: 'Y', destination: 'Z', recipient: 'R',
    });
    assert.equal(res.status, 401);
  });
});

// ── 5.2 Create validation ────────────────────────────────────────────────────
describe('POST /api/shipments — validation', () => {
  it('missing required fields → 422 with errors array', async () => {
    const res = await post('/api/shipments', {}, aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors), 'errors must be an array');
    assert.ok(body.errors.length > 0, 'errors must not be empty');
    for (const e of body.errors) {
      assert.ok('field' in e, 'each error must have field');
      assert.ok('reason' in e, 'each error must have reason');
    }
  });

  it('missing individual fields (no origin) → 422', async () => {
    const res = await post('/api/shipments', {
      title: 'T', destination: 'D', recipient: 'R',
    }, aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
  });

  it('title over 120 chars → 422', async () => {
    const res = await post('/api/shipments', {
      title: 'A'.repeat(121),
      origin: 'Origin',
      destination: 'Destination',
      recipient: 'Recipient',
    }, aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
    const titleError = body.errors.find((e) => e.field === 'title');
    assert.ok(titleError, 'errors must contain a title field error');
  });

  it('origin over 200 chars → 422', async () => {
    const res = await post('/api/shipments', {
      title: 'Title',
      origin: 'O'.repeat(201),
      destination: 'Destination',
      recipient: 'Recipient',
    }, aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
    const originError = body.errors.find((e) => e.field === 'origin');
    assert.ok(originError, 'errors must contain an origin field error');
  });
});

// ── 5.3 List shipments ───────────────────────────────────────────────────────
describe('GET /api/shipments — list', () => {
  // We rely on shipments created in earlier tests, plus create fresh ones for isolation.
  let aliceShipId;
  let bobShipId;

  before(async () => {
    const a = await createShipment(aliceToken, { title: 'Alice List Test' });
    aliceShipId = a._id;
    const b = await createShipment(bobToken, { title: 'Bob List Test' });
    bobShipId = b._id;
  });

  it('alice sees only her own shipments', async () => {
    const res = await get('/api/shipments', aliceToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok('data' in body && 'total' in body && 'page' in body && 'limit' in body,
      'response must have data, total, page, limit');
    for (const s of body.data) {
      assert.equal(s.createdBy.toString(), aliceId,
        `alice must only see her own shipments but found createdBy ${s.createdBy}`);
    }
  });

  it('bob sees only his own shipments', async () => {
    const res = await get('/api/shipments', bobToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    for (const s of body.data) {
      assert.equal(s.createdBy.toString(), bobId,
        `bob must only see his own shipments but found createdBy ${s.createdBy}`);
    }
  });

  it('admin (carol) sees all shipments', async () => {
    const aliceRes = await get('/api/shipments', aliceToken);
    const bobRes   = await get('/api/shipments', bobToken);
    const adminRes = await get('/api/shipments', carolToken);

    const aliceBody = await aliceRes.json();
    const bobBody   = await bobRes.json();
    const adminBody = await adminRes.json();

    // Admin total >= alice's total + bob's total (they may share none)
    assert.ok(
      adminBody.total >= aliceBody.total + bobBody.total,
      `admin.total (${adminBody.total}) should be >= alice.total (${aliceBody.total}) + bob.total (${bobBody.total})`
    );
  });

  it('list items have no history field', async () => {
    const res = await get('/api/shipments', aliceToken);
    const body = await res.json();
    for (const s of body.data) {
      assert.ok(!('history' in s), 'list items must not have history');
    }
  });

  it('response has data, total, page, limit', async () => {
    const res = await get('/api/shipments', aliceToken);
    const body = await res.json();
    assert.ok(Array.isArray(body.data), 'data must be an array');
    assert.ok(typeof body.total === 'number', 'total must be a number');
    assert.ok(typeof body.page === 'number', 'page must be a number');
    assert.ok(typeof body.limit === 'number', 'limit must be a number');
  });

  it('?status=CREATED filter returns only CREATED shipments', async () => {
    const res = await get('/api/shipments?status=CREATED', carolToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    for (const s of body.data) {
      assert.equal(s.status, 'CREATED');
    }
  });

  it('?limit=101 → 422', async () => {
    const res = await get('/api/shipments?limit=101', aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
  });

  it('?page=0 → 422', async () => {
    const res = await get('/api/shipments?page=0', aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
  });

  it('?status=NOPE → 422', async () => {
    const res = await get('/api/shipments?status=NOPE', aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
  });
});

// ── 5.4 Get detail ───────────────────────────────────────────────────────────
describe('GET /api/shipments/:id — get detail', () => {
  let shipId;

  before(async () => {
    const s = await createShipment(aliceToken, { title: 'Detail Test' });
    shipId = s._id;
  });

  it('owner (alice) gets 200 with history ordered ascending and actor {id, name}', async () => {
    const res = await get(`/api/shipments/${shipId}`, aliceToken);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.history), 'detail must include history');
    // Verify ascending order by 'at' timestamp
    for (let i = 1; i < body.history.length; i++) {
      const prev = new Date(body.history[i - 1].at).getTime();
      const curr = new Date(body.history[i].at).getTime();
      assert.ok(prev <= curr, 'history entries must be ordered ascending by at');
    }
    for (const entry of body.history) {
      assert.ok(entry.actor, 'history entry must have actor');
      assert.ok(typeof entry.actor.id !== 'undefined', 'actor must have id');
      assert.ok(typeof entry.actor.name === 'string', 'actor must have name');
    }
  });

  it('bob (non-owner) gets 404', async () => {
    const res = await get(`/api/shipments/${shipId}`, bobToken);
    assert.equal(res.status, 404);
  });

  it('admin (carol) gets 200', async () => {
    const res = await get(`/api/shipments/${shipId}`, carolToken);
    assert.equal(res.status, 200);
  });

  it('invalid id "abc" → 404', async () => {
    const res = await get('/api/shipments/abc', aliceToken);
    assert.equal(res.status, 404);
  });

  it('valid ObjectId that does not exist → 404', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await get(`/api/shipments/${fakeId}`, aliceToken);
    assert.equal(res.status, 404);
  });
});

// ── 5.5 Edit (PATCH) ─────────────────────────────────────────────────────────
describe('PATCH /api/shipments/:id — edit', () => {
  let shipId;

  before(async () => {
    const s = await createShipment(aliceToken, { title: 'Edit Test' });
    shipId = s._id;
  });

  it('owner (alice) can edit → 200 with updated fields', async () => {
    const res = await patch(`/api/shipments/${shipId}`, { title: 'Updated Title' }, aliceToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.title, 'Updated Title');
  });

  it('bob (non-owner) gets 404', async () => {
    const res = await patch(`/api/shipments/${shipId}`, { title: 'Bob Update' }, bobToken);
    assert.equal(res.status, 404);
  });

  it('admin (carol) gets 404 (only owner can edit)', async () => {
    const res = await patch(`/api/shipments/${shipId}`, { title: 'Admin Update' }, carolToken);
    assert.equal(res.status, 404);
  });

  it('empty body {} → 422', async () => {
    const res = await patch(`/api/shipments/${shipId}`, {}, aliceToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
  });

  it('after status leaves CREATED → 409', async () => {
    // Advance the shipment past CREATED via admin
    await changeStatus(shipId, 'PICKED_UP', carolToken);
    const res = await patch(`/api/shipments/${shipId}`, { title: 'Too Late' }, aliceToken);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(typeof body.message === 'string');
  });

  it('PATCH body with status/createdBy/history is ignored (those fields are stripped)', async () => {
    const fresh = await createShipment(aliceToken, { title: 'Strip Test' });
    const freshId = fresh._id;

    // Attempt to inject forbidden fields
    const res = await patch(`/api/shipments/${freshId}`, {
      title: 'Allowed Title',
      status: 'DELIVERED',
      createdBy: bobId,
      history: [],
    }, aliceToken);

    assert.equal(res.status, 200);
    const body = await res.json();
    // status/createdBy/history must NOT have changed
    assert.equal(body.status, 'CREATED', 'status must not be changed via PATCH');
    assert.equal(body.createdBy.toString(), aliceId, 'createdBy must not be changed via PATCH');
    assert.ok(body.history.length >= 1, 'history must not be cleared via PATCH');
    assert.equal(body.title, 'Allowed Title', 'title must have been updated');
  });
});

// ── 5.6 Status transitions — admin ───────────────────────────────────────────
describe('POST /api/shipments/:id/status — admin transitions', () => {
  let shipId;

  before(async () => {
    const s = await createShipment(aliceToken, { title: 'Admin Status Test' });
    shipId = s._id;
  });

  it('CREATED → PICKED_UP → 200, history gains one entry with from=CREATED', async () => {
    const { res, body } = await changeStatus(shipId, 'PICKED_UP', carolToken);
    assert.equal(res.status, 200);
    assert.equal(body.status, 'PICKED_UP');

    const lastEntry = body.history[body.history.length - 1];
    assert.equal(lastEntry.from, 'CREATED');
    assert.equal(lastEntry.to, 'PICKED_UP');
  });

  it('PICKED_UP → IN_TRANSIT → 200', async () => {
    const { res, body } = await changeStatus(shipId, 'IN_TRANSIT', carolToken);
    assert.equal(res.status, 200);
    assert.equal(body.status, 'IN_TRANSIT');
  });

  it('IN_TRANSIT → DELIVERED → 200', async () => {
    const { res, body } = await changeStatus(shipId, 'DELIVERED', carolToken);
    assert.equal(res.status, 200);
    assert.equal(body.status, 'DELIVERED');
  });

  it('CREATED → DELIVERED (invalid skip) → 409 with allowed list', async () => {
    const fresh = await createShipment(aliceToken, { title: 'Skip Test' });
    const { res, body } = await changeStatus(fresh._id, 'DELIVERED', carolToken);
    assert.equal(res.status, 409);
    assert.ok(Array.isArray(body.allowed), 'allowed must be an array');
    assert.ok(body.allowed.length > 0, 'allowed must not be empty for CREATED');
    assert.ok(body.allowed.includes('PICKED_UP'), 'PICKED_UP must be in allowed from CREATED');
  });

  it('from DELIVERED any move → 409 with empty allowed list', async () => {
    // shipId is currently DELIVERED from the chain above
    const { res, body } = await changeStatus(shipId, 'PICKED_UP', carolToken);
    assert.equal(res.status, 409);
    assert.ok(Array.isArray(body.allowed));
    assert.equal(body.allowed.length, 0, 'allowed must be [] for DELIVERED terminal state');
  });
});

// ── 5.7 Status transitions — owner ───────────────────────────────────────────
describe('POST /api/shipments/:id/status — owner transitions', () => {
  let aliceShipId;
  let pickedUpShipId;

  before(async () => {
    // A fresh CREATED shipment for alice-cancel tests
    const a = await createShipment(aliceToken, { title: 'Owner Cancel CREATED' });
    aliceShipId = a._id;

    // A shipment advanced past CREATED (alice owns it, admin advanced it)
    const b = await createShipment(aliceToken, { title: 'Owner Cancel PICKED_UP' });
    pickedUpShipId = b._id;
    await changeStatus(pickedUpShipId, 'PICKED_UP', carolToken);
  });

  it('owner cancels own CREATED shipment → 200 with status CANCELLED', async () => {
    const { res, body } = await changeStatus(aliceShipId, 'CANCELLED', aliceToken);
    assert.equal(res.status, 200);
    assert.equal(body.status, 'CANCELLED');
  });

  it('owner tries PICKED_UP on own CREATED shipment → 403', async () => {
    // Need a fresh CREATED shipment
    const fresh = await createShipment(aliceToken, { title: 'Owner Non-Cancel' });
    const { res, body } = await changeStatus(fresh._id, 'PICKED_UP', aliceToken);
    assert.equal(res.status, 403);
    assert.ok(typeof body.message === 'string');
  });

  it('owner tries to cancel after PICKED_UP → 403', async () => {
    const { res, body } = await changeStatus(pickedUpShipId, 'CANCELLED', aliceToken);
    assert.equal(res.status, 403);
    assert.ok(typeof body.message === 'string');
  });

  it('bob on alice\'s shipment → 404', async () => {
    const aliceShip = await createShipment(aliceToken, { title: 'Bob on Alice' });
    const { res } = await changeStatus(aliceShip._id, 'CANCELLED', bobToken);
    assert.equal(res.status, 404);
  });

  it('no token → 401', async () => {
    const res = await post(`/api/shipments/${aliceShipId}/status`, { to: 'CANCELLED' });
    assert.equal(res.status, 401);
  });
});

// ── 5.8 Status validation ────────────────────────────────────────────────────
describe('POST /api/shipments/:id/status — validation', () => {
  let shipId;

  before(async () => {
    const s = await createShipment(aliceToken, { title: 'Status Validation Test' });
    shipId = s._id;
  });

  it('missing "to" field → 422', async () => {
    const res = await post(`/api/shipments/${shipId}/status`, {}, carolToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
  });

  it('invalid "to" value → 422', async () => {
    const res = await post(`/api/shipments/${shipId}/status`, { to: 'FLYING' }, carolToken);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
  });

  it('note over 280 chars → 422', async () => {
    const res = await post(`/api/shipments/${shipId}/status`,
      { to: 'PICKED_UP', note: 'N'.repeat(281) },
      carolToken
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
    const noteError = body.errors.find((e) => e.field === 'note');
    assert.ok(noteError, 'errors must contain a note field error');
  });
});

// ── 5.9 Race condition ───────────────────────────────────────────────────────
describe('POST /api/shipments/:id/status — race condition', () => {
  it('two simultaneous PICKED_UP requests: exactly one 200 and one 409; history has exactly 2 entries', async () => {
    const s = await createShipment(aliceToken, { title: 'Race Test' });
    const shipId = s._id;

    // Fire both requests simultaneously
    const [r1, r2] = await Promise.all([
      post(`/api/shipments/${shipId}/status`, { to: 'PICKED_UP' }, carolToken),
      post(`/api/shipments/${shipId}/status`, { to: 'PICKED_UP' }, carolToken),
    ]);

    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);

    const statuses = [r1.status, r2.status];
    const twoHundreds = statuses.filter((s) => s === 200).length;
    const fourOhNines = statuses.filter((s) => s === 409).length;

    assert.equal(twoHundreds, 1, `exactly one request must succeed (200), got statuses: ${statuses}`);
    assert.equal(fourOhNines, 1, `exactly one request must fail (409), got statuses: ${statuses}`);

    // The 409 body must have an allowed array
    const failBody = r1.status === 409 ? b1 : b2;
    assert.ok(Array.isArray(failBody.allowed), '409 body must have allowed array');

    // Verify history has exactly 2 entries (initial CREATED + one PICKED_UP)
    const detailRes = await get(`/api/shipments/${shipId}`, carolToken);
    const detail = await detailRes.json();
    assert.equal(detail.history.length, 2,
      `history must have exactly 2 entries after race, got ${detail.history.length}`);
  });
});

// ── 5.10 History integrity ───────────────────────────────────────────────────
describe('History integrity', () => {
  it('after several transitions: entries are ordered ascending, each from equals previous to', async () => {
    const s = await createShipment(aliceToken, { title: 'History Integrity Test' });
    const shipId = s._id;

    // Drive through a full lifecycle: CREATED → PICKED_UP → IN_TRANSIT → DELIVERED
    await changeStatus(shipId, 'PICKED_UP',  carolToken);
    await changeStatus(shipId, 'IN_TRANSIT', carolToken);
    await changeStatus(shipId, 'DELIVERED',  carolToken);

    const res = await get(`/api/shipments/${shipId}`, carolToken);
    assert.equal(res.status, 200);
    const { history } = await res.json();

    // Expect 4 entries
    assert.equal(history.length, 4,
      `expected 4 history entries, got ${history.length}`);

    // First entry: from null, to CREATED
    assert.equal(history[0].from, null);
    assert.equal(history[0].to, 'CREATED');

    // Ascending order by 'at'
    for (let i = 1; i < history.length; i++) {
      const prev = new Date(history[i - 1].at).getTime();
      const curr = new Date(history[i].at).getTime();
      assert.ok(prev <= curr,
        `entry ${i} at (${history[i].at}) must be >= entry ${i - 1} at (${history[i - 1].at})`);
    }

    // Each entry's 'from' equals the previous entry's 'to'
    for (let i = 1; i < history.length; i++) {
      assert.equal(history[i].from, history[i - 1].to,
        `history[${i}].from (${history[i].from}) must equal history[${i - 1}].to (${history[i - 1].to})`);
    }
  });
});
