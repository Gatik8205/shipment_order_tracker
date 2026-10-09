const crypto = require('crypto');

/**
 * Generates a unique tracking ID with the format TRK-<10 uppercase hex chars>.
 * Pure generation — no database access.
 *
 * @returns {string}  e.g. "TRK-A3F9C12B4E"
 */
function generateTrackingId() {
  return 'TRK-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

module.exports = { generateTrackingId };
