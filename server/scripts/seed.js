/**
 * seed.js — Populates the database with representative data for development /
 * demonstration purposes.
 *
 * Usage:  node server/scripts/seed.js
 *         (or:  node scripts/seed.js   from inside server/)
 *
 * Safety: refuses to run when NODE_ENV === 'production'.
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. Production guard (must come before any DB-touching import)
// ---------------------------------------------------------------------------
// Load env first so NODE_ENV is resolved from .env when not already set.
// We require env.js which calls dotenv.config(); after that NODE_ENV is stable.
const env = require('../src/config/env');

if (env.NODE_ENV === 'production') {
  console.error(
    '[seed] Refusing to run in production. Set NODE_ENV to development or test.'
  );
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

/** Plaintext account definitions — printed on success. */
const ACCOUNT_DEFS = [
  { name: 'Seed Admin',  email: 'admin@seed.dev',  password: 'Admin1234!', role: 'admin' },
  { name: 'Alice User',  email: 'alice@seed.dev',  password: 'Alice1234!', role: 'user'  },
  { name: 'Bob User',    email: 'bob@seed.dev',    password: 'Bob12345!',  role: 'user'  },
];

/**
 * Shipment template definitions.
 *
 * statusPath: the ordered list of statuses the shipment has traversed
 *             (starting from null → CREATED implicitly handled below).
 * ownerIndex: index into ACCOUNT_DEFS for the User who owns the shipment
 *             (0 = admin, 1 = alice, 2 = bob — but only users can "own"
 *             in the business-logic sense; here we assign to alice or bob).
 *
 * Actor rules per Requirement 8:
 *   - null → CREATED  : owner (the user who created it)
 *   - CREATED → CANCELLED : owner
 *   - All other transitions: admin
 */
const SHIPMENT_DEFS = [
  // ── CREATED (3 shipments) ────────────────────────────────────────────────
  {
    title: 'Laptop Stand',
    origin: 'New York, NY',
    destination: 'Boston, MA',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED'],
  },
  {
    title: 'Mechanical Keyboard',
    origin: 'San Francisco, CA',
    destination: 'Los Angeles, CA',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED'],
  },
  {
    title: 'Monitor Cable',
    origin: 'Chicago, IL',
    destination: 'Detroit, MI',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED'],
  },

  // ── PICKED_UP (2 shipments) ──────────────────────────────────────────────
  {
    title: 'Wireless Mouse',
    origin: 'Austin, TX',
    destination: 'Dallas, TX',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED', 'PICKED_UP'],
  },
  {
    title: 'USB Hub',
    origin: 'Seattle, WA',
    destination: 'Portland, OR',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED', 'PICKED_UP'],
  },

  // ── IN_TRANSIT (2 shipments) ─────────────────────────────────────────────
  {
    title: 'External SSD',
    origin: 'Miami, FL',
    destination: 'Orlando, FL',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'],
  },
  {
    title: 'Webcam',
    origin: 'Denver, CO',
    destination: 'Salt Lake City, UT',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'],
  },

  // ── DELIVERED (3 shipments) ──────────────────────────────────────────────
  {
    title: 'Gaming Headset',
    origin: 'Phoenix, AZ',
    destination: 'Tucson, AZ',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'],
  },
  {
    title: 'Desk Lamp',
    origin: 'Nashville, TN',
    destination: 'Memphis, TN',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'],
  },
  {
    title: 'Ergonomic Chair',
    origin: 'Philadelphia, PA',
    destination: 'Pittsburgh, PA',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'],
  },

  // ── CANCELLED (2 shipments) ──────────────────────────────────────────────
  // Cancelled from CREATED — actor is the owner
  {
    title: 'Printer Ink',
    origin: 'Charlotte, NC',
    destination: 'Raleigh, NC',
    recipient: 'Alice Smith',
    ownerKey: 'alice',
    statusPath: ['CREATED', 'CANCELLED'],
    cancelledFromCreated: true, // flag: CANCELLED transition actor = owner
  },
  // Cancelled from PICKED_UP — actor is admin
  {
    title: 'Laptop Bag',
    origin: 'Minneapolis, MN',
    destination: 'Madison, WI',
    recipient: 'Bob Johnson',
    ownerKey: 'bob',
    statusPath: ['CREATED', 'PICKED_UP', 'CANCELLED'],
  },
];

// ---------------------------------------------------------------------------
// 4. Helper: build history entries for a shipment
// ---------------------------------------------------------------------------

/**
 * Returns an array of history entry plain objects for the given statusPath.
 *
 * @param {string[]} statusPath  e.g. ['CREATED', 'PICKED_UP', 'IN_TRANSIT']
 * @param {mongoose.Types.ObjectId} ownerId
 * @param {mongoose.Types.ObjectId} adminId
 * @param {boolean} cancelledFromCreated  true → CANCELLED actor is owner
 * @param {Date}    baseTime              starting timestamp
 * @returns {{ from: string|null, to: string, actor: ObjectId, at: Date }[]}
 */
function buildHistory(statusPath, ownerId, adminId, cancelledFromCreated, baseTime) {
  const entries = [];
  // Walk through each status in the path and record the transition that led to it.
  // statusPath[0] is always 'CREATED', entered from null.
  for (let i = 0; i < statusPath.length; i++) {
    const from = i === 0 ? null : statusPath[i - 1];
    const to   = statusPath[i];

    // Determine actor
    let actor;
    if (to === 'CREATED') {
      // Initial creation — owner
      actor = ownerId;
    } else if (to === 'CANCELLED' && cancelledFromCreated && from === 'CREATED') {
      // User-initiated cancellation from CREATED
      actor = ownerId;
    } else {
      // All other transitions: admin
      actor = adminId;
    }

    // Each entry is spaced 1 hour apart to guarantee strictly increasing timestamps
    const at = new Date(baseTime.getTime() + i * 60 * 60 * 1000);

    entries.push({ from, to, actor, at });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// 5. Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  await connectDB();

  // ── 5a. Hash passwords ───────────────────────────────────────────────────
  console.log('Hashing passwords…');
  const hashedAccounts = await Promise.all(
    ACCOUNT_DEFS.map(async (acct) => ({
      ...acct,
      passwordHash: await bcrypt.hash(acct.password, BCRYPT_COST),
    }))
  );

  // ── 5b. Build User documents ─────────────────────────────────────────────
  const userDocs = hashedAccounts.map((acct) => {
    const doc = new User({
      name:         acct.name,
      email:        acct.email,
      passwordHash: acct.passwordHash,
      role:         acct.role,
    });
    // Validate in memory; throws ValidationError if schema rejects the data
    const err = doc.validateSync();
    if (err) throw err;
    return doc;
  });

  // Build a lookup map: 'admin' | 'alice' | 'bob' → ObjectId
  const idByKey = {
    admin: userDocs[0]._id,
    alice: userDocs[1]._id,
    bob:   userDocs[2]._id,
  };

  // ── 5c. Build Shipment documents ─────────────────────────────────────────
  // Spread base times across the last 30 days so createdAt ordering is stable.
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const shipmentDocs = SHIPMENT_DEFS.map((def, idx) => {
    const ownerId  = idByKey[def.ownerKey];
    const adminId  = idByKey.admin;

    // Base time: spread evenly backward from now, oldest shipment first
    const baseTime = new Date(now - THIRTY_DAYS_MS + idx * (THIRTY_DAYS_MS / SHIPMENT_DEFS.length));

    const history = buildHistory(
      def.statusPath,
      ownerId,
      adminId,
      def.cancelledFromCreated || false,
      baseTime
    );

    const finalStatus = def.statusPath[def.statusPath.length - 1];

    const doc = new Shipment({
      trackingId:  generateTrackingId(),
      title:       def.title,
      origin:      def.origin,
      destination: def.destination,
      recipient:   def.recipient,
      status:      finalStatus,
      createdBy:   ownerId,
      history,
    });

    const err = doc.validateSync();
    if (err) throw err;

    return doc;
  });

  // ── 5d. Verify counts ────────────────────────────────────────────────────
  if (shipmentDocs.length !== 12) {
    throw new Error(`Expected 12 shipments, got ${shipmentDocs.length}`);
  }

  const statusCounts = {};
  for (const doc of shipmentDocs) {
    statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
  }
  const REQUIRED_STATUSES = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
  for (const s of REQUIRED_STATUSES) {
    if (!statusCounts[s]) {
      throw new Error(`No shipment with status ${s} — all 5 statuses must be represented`);
    }
  }

  // ── 5e. Clear existing data ──────────────────────────────────────────────
  console.log('Deleting existing users and shipments…');
  await User.deleteMany({});
  await Shipment.deleteMany({});

  // ── 5f. Insert ───────────────────────────────────────────────────────────
  console.log('Inserting users…');
  await User.insertMany(userDocs, { lean: true });

  console.log('Inserting shipments…');
  await Shipment.insertMany(shipmentDocs, { lean: true });

  // ── 5g. Success output ───────────────────────────────────────────────────
  console.log('\n✅  Seed complete!\n');
  console.log('Accounts created:');
  console.log('─'.repeat(68));
  console.log(
    'Name'.padEnd(16),
    'Email'.padEnd(22),
    'Password'.padEnd(14),
    'Role'
  );
  console.log('─'.repeat(68));
  for (const acct of ACCOUNT_DEFS) {
    console.log(
      acct.name.padEnd(16),
      acct.email.padEnd(22),
      acct.password.padEnd(14),
      acct.role
    );
  }
  console.log('─'.repeat(68));

  console.log(`\nShipment status distribution:`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Entry point
// ---------------------------------------------------------------------------

seed()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed] Error:', err.message || err);
    mongoose.disconnect();
    process.exit(1);
  });
