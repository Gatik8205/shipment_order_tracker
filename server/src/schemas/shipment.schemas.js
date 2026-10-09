const { z } = require('zod');
const { STATUSES } = require('../utils/transitions');

// Derived from the single source of truth in transitions.js
const statusEnum = z.enum(Object.values(STATUSES));

// ---------------------------------------------------------------------------
// Reusable field definitions
// ---------------------------------------------------------------------------

const title       = z.string({ error: 'title is required' }).trim().min(1, { error: 'title must be at least 1 character' }).max(120, { error: 'title must be at most 120 characters' });
const origin      = z.string({ error: 'origin is required' }).trim().min(1, { error: 'origin must be at least 1 character' }).max(200, { error: 'origin must be at most 200 characters' });
const destination = z.string({ error: 'destination is required' }).trim().min(1, { error: 'destination must be at least 1 character' }).max(200, { error: 'destination must be at most 200 characters' });
const recipient   = z.string({ error: 'recipient is required' }).trim().min(1, { error: 'recipient must be at least 1 character' }).max(120, { error: 'recipient must be at most 120 characters' });

// ---------------------------------------------------------------------------
// 4.2a  createShipmentSchema
// ---------------------------------------------------------------------------

const createShipmentSchema = z.object({
  title,
  origin,
  destination,
  recipient,
});

// ---------------------------------------------------------------------------
// 4.2b  patchShipmentSchema
// ---------------------------------------------------------------------------

const patchShipmentSchema = z
  .object({
    title:       title.optional(),
    origin:      origin.optional(),
    destination: destination.optional(),
    recipient:   recipient.optional(),
  })
  .refine(
    (data) =>
      Object.values(data).some(
        (v) => typeof v === 'string' && v.trim().length > 0
      ),
    { error: 'At least one field is required' }
  );

// ---------------------------------------------------------------------------
// 4.2c  listQuerySchema
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: statusEnum.optional(),

  // z.coerce.number() converts strings; .int() + .min(1) reject fractions /
  // zero / negatives; values over 100 are rejected by .max() — not clamped.
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int({ error: 'page must be an integer' })
    .min(1, { error: 'page must be at least 1' })
    .default(1),

  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int({ error: 'limit must be an integer' })
    .min(1, { error: 'limit must be at least 1' })
    .max(100, { error: 'limit must be at most 100' })
    .default(20),
});

// ---------------------------------------------------------------------------
// 4.2d  statusChangeSchema
// ---------------------------------------------------------------------------

const statusChangeSchema = z.object({
  to:   statusEnum,
  note: z
    .string()
    .trim()
    .max(280, { error: 'note must be at most 280 characters' })
    .optional(),
});

module.exports = {
  createShipmentSchema,
  patchShipmentSchema,
  listQuerySchema,
  statusChangeSchema,
};
