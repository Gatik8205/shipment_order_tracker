'use strict';

/**
 * shipmentService.test.js
 *
 * Service-level tests for createShipment's TrackingId retry logic.
 * (Race, permission and history behaviour are covered end to end in
 * shipments.api.test.js.)
 *
 * A real collision on a 10-hex-character id essentially never happens, so the
 * generator is replaced with a queue-driven stub BEFORE the service is loaded
 * (the service destructures generateTrackingId when it is first required).
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ── Patch the generator before anything requires the service ───────────────
const trackingUtil = require('../src/utils/generateTrackingId');
const realGenerate = trackingUtil.generateTrackingId;
let queue = [];
let calls = 0;
trackingUtil.generateTrackingId = () => {
  calls += 1;
  return queue.length > 0 ? queue.shift() : realGenerate();
};

const Shipment = require('../src/models/Shipment');
const User = require('../src/models/User');
const { createShipment } = require('../src/services/shipmentService');

let mms;
let actor;

const DATA = { title: 'Retry Test', origin: 'A', destination: 'B', recipient: 'C' };

before(async () => {
  mms = await MongoMemoryServer.create();
  await mongoose.connect(mms.getUri());
  await Shipment.init(); // make sure the unique index on trackingId exists
  actor = await User.create({ name: 'tester', email: 'tester@example.com', passwordHash: 'x' });
});

after(async () => {
  await mongoose.disconnect();
  await mms.stop();
});

beforeEach(async () => {
  await Shipment.deleteMany({});
  queue = [];
  calls = 0;
});

async function insertExisting(trackingId) {
  await Shipment.create({
    ...DATA,
    trackingId,
    createdBy: actor._id,
    history: [{ from: null, to: 'CREATED', actor: actor._id }],
  });
}

describe('createShipment trackingId collision handling', () => {
  it('retries on duplicate-key errors and succeeds with a fresh id', async () => {
    await insertExisting('TRK-DUPLICATE0');
    queue = ['TRK-DUPLICATE0', 'TRK-DUPLICATE0', 'TRK-FRESH00001'];

    const result = await createShipment({ actor, data: DATA });

    assert.equal(result.trackingId, 'TRK-FRESH00001');
    assert.equal(calls, 3, 'generator must be called once per attempt');
    assert.equal(await Shipment.countDocuments({}), 2);
  });

  it('gives up after 5 attempts with a 500 and saves nothing extra', async () => {
    await insertExisting('TRK-DUPLICATE0');
    queue = Array(5).fill('TRK-DUPLICATE0');

    await assert.rejects(
      () => createShipment({ actor, data: DATA }),
      (err) => err.status === 500 && /unique tracking id/i.test(err.message)
    );

    assert.equal(calls, 5, 'exactly 5 attempts in total');
    assert.equal(await Shipment.countDocuments({}), 1, 'only the pre-existing shipment remains');
  });

  it('does not retry on non-duplicate errors', async () => {
    await assert.rejects(
      () => createShipment({ actor, data: { ...DATA, title: undefined } }),
      (err) => err.name === 'ValidationError'
    );
    assert.equal(calls, 1, 'a validation error must not trigger retries');
  });
});
