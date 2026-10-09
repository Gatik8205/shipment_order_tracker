/**
 * seed.js — Populates the database with representative data for development /
 * demonstration purposes.
 *
 * Usage:  npm run seed          (from inside server/)
 *
 * Safety: refuses to run when NODE_ENV === 'production'. It DELETES all users
 * and shipments in the database named by MONGO_URI, so check the printed
 * database name.
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. Production guard (must come before any DB-touching work)
// ---------------------------------------------------------------------------
const env = require('../src/config/env');

if (env.NODE_ENV === 'production') {
  console.error('[seed] Refusing to run in production. Set NODE_ENV to development or test.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Dependencies
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Shipment = require('../src/models/Shipment');
const { generateTrackingId } = require('../src/utils/generateTrackingId');

// ---------------------------------------------------------------------------
// 3. Seed data definitions
// ---------------------------------------------------------------------------

const BCRYPT_COST = 10;
const HOUR_MS = 60 * 60 * 1000;

/** Plaintext account definitions — printed on success. */
const ACCOUNT_DEFS = [
  { key: 'admin', name: 'Seed Admin', email: 'admin@seed.dev', password: 'Admin1234!', role: 'admin' },
  { key: 'alice', name: 'Alice User', email: 'alice@seed.dev', password: 'Alice1234!', role: 'user' },
  { key: 'bob',   name: 'Bob User',   email: 'bob@seed.dev',   password: 'Bob12345!',  role: 'user' },
];

/**
 * Shipment definitions. statusPath is the ordered list of statuses traversed,
 * always starting with CREATED (entered from null).
 *
 * Actor rules (Requirement 8):
 *   - creation (null -> CREATED)      : owner
 *   - CREATED -> CANCELLED            : owner (cancelledByOwner = true)
 *   - every other transition          : admin
 */
const SHIPMENT_DEFS = [
  // CREATED (3)
  { title: 'Laptop Stand', origin: 'New York, NY', destination: 'Boston, MA', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED'] },
  { title: 'Mechanical Keyboard', origin: 'San Francisco, CA', destination: 'Los Angeles, CA', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED'] },
  { title: 'Monitor Cable', origin: 'Chicago, IL', destination: 'Detroit, MI', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED'] },

  // PICKED_UP (2)
  { title: 'Wireless Mouse', origin: 'Austin, TX', destination: 'Dallas, TX', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED', 'PICKED_UP'] },
  { title: 'USB Hub', origin: 'Seattle, WA', destination: 'Portland, OR', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED', 'PICKED_UP'] },

  // IN_TRANSIT (2)
  { title: 'External SSD', origin: 'Miami, FL', destination: 'Orlando, FL', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'] },
  { title: 'Webcam', origin: 'Denver, CO', destination: 'Salt Lake City, UT', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'] },

  // DELIVERED (3)
  { title: 'Gaming Headset', origin: 'Phoenix, AZ', destination: 'Tucson, AZ', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] },
  { title: 'Desk Lamp', origin: 'Nashville, TN', destination: 'Memphis, TN', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] },
  { title: 'Ergonomic Chair', origin: 'Philadelphia, PA', destination: 'Pittsburgh, PA', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] },

  // CANCELLED (2): one cancelled by the owner while CREATED, one by the admin after pickup
  { title: 'Printer Ink', origin: 'Charlotte, NC', destination: 'Raleigh, NC', recipient: 'Alice Smith', ownerKey: 'alice', statusPath: ['CREATED', 'CANCELLED'], cancelledByOwner: true },
  { title: 'Laptop Bag', origin: 'Minneapolis, MN', destination: 'Madison, WI', recipient: 'Bob Johnson', ownerKey: 'bob', statusPath: ['CREATED', 'PICKED_UP', 'CANCELLED'] },
];

// ---------------------------------------------------------------------------
// 4. Helper: build history entries for a shipment
// ---------------------------------------------------------------------------

function buildHistory(statusPath, ownerId, adminId, cancelledByOwner, baseTime) {
  return statusPath.map((to, i) => {
    const from = i === 0 ? null : statusPath[i - 1];

    let actor = adminId;
    if (to === 'CREATED') actor = ownerId;
    else if (to === 'CANCELLED' && from === 'CREATED' && cancelledByOwner) actor = ownerId;

    // One hour apart: strictly increasing timestamps
    return { from, to, actor, at: new Date(baseTime.getTime() + i * HOUR_MS) };
  });
}

// ---------------------------------------------------------------------------
// 5. Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  await connectDB();
  console.log(`Target database: "${mongoose.connection.name}"`);

  // Build and validate EVERYTHING in memory before touching the database
  console.log('Hashing passwords…');
  const userDocs = await Promise.all(
    ACCOUNT_DEFS.map(async (acct) => {
      const doc = new User({
        name: acct.name,
        email: acct.email,
        passwordHash: await bcrypt.hash(acct.password, BCRYPT_COST),
        role: acct.role,
      });
      const err = doc.validateSync();
      if (err) throw err;
      return doc;
    })
  );

  const idByKey = {};
  ACCOUNT_DEFS.forEach((acct, i) => { idByKey[acct.key] = userDocs[i]._id; });

  // Spread shipments over the last 30 days, oldest first
  const now = Date.now();
  const SPAN_MS = 30 * 24 * HOUR_MS;

  const shipmentDocs = SHIPMENT_DEFS.map((def, idx) => {
    const baseTime = new Date(now - SPAN_MS + idx * (SPAN_MS / SHIPMENT_DEFS.length));
    const history = buildHistory(
      def.statusPath,
      idByKey[def.ownerKey],
      idByKey.admin,
      Boolean(def.cancelledByOwner),
      baseTime
    );

    const doc = new Shipment({
      trackingId: generateTrackingId(),
      title: def.title,
      origin: def.origin,
      destination: def.destination,
      recipient: def.recipient,
      status: def.statusPath[def.statusPath.length - 1],
      createdBy: idByKey[def.ownerKey],
      history,
      // Keep timestamps consistent with the history instead of "now"
      createdAt: baseTime,
      updatedAt: history[history.length - 1].at,
    });

    const err = doc.validateSync();
    if (err) throw err;
    return doc;
  });

  // Sanity checks on the in-memory data
  if (shipmentDocs.length !== 12) {
    throw new Error(`Expected 12 shipments, got ${shipmentDocs.length}`);
  }
  const statusCounts = {};
  for (const doc of shipmentDocs) statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
  for (const s of ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']) {
    if (!statusCounts[s]) throw new Error(`No shipment with status ${s}; all 5 statuses must be present`);
  }

  // Replace existing data
  console.log('Deleting existing users and shipments…');
  await User.deleteMany({});
  await Shipment.deleteMany({});

  // Insert; if anything fails, remove whatever from THIS run was inserted
  try {
    console.log('Inserting users…');
    await User.insertMany(userDocs);
    console.log('Inserting shipments…');
    await Shipment.insertMany(shipmentDocs);
  } catch (err) {
    await Shipment.deleteMany({ _id: { $in: shipmentDocs.map((d) => d._id) } });
    await User.deleteMany({ _id: { $in: userDocs.map((d) => d._id) } });
    throw err;
  }

  // Success output
  console.log('\nSeed complete!\n');
  console.log('Accounts created:');
  console.log('-'.repeat(68));
  console.log('Name'.padEnd(16), 'Email'.padEnd(22), 'Password'.padEnd(14), 'Role');
  console.log('-'.repeat(68));
  for (const acct of ACCOUNT_DEFS) {
    console.log(acct.name.padEnd(16), acct.email.padEnd(22), acct.password.padEnd(14), acct.role);
  }
  console.log('-'.repeat(68));

  console.log('\nShipment status distribution:');
  for (const [status, count] of Object.entries(statusCounts)) console.log(`  ${status}: ${count}`);
}

// ---------------------------------------------------------------------------
// 6. Entry point
// ---------------------------------------------------------------------------

seed()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] Error:', err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });