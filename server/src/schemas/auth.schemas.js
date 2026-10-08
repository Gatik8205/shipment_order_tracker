const z = require('zod');

/**
 * Register schema (Zod 4 API).
 *
 * - Unknown keys (for example `role`) are stripped by z.object, so a client can
 *   never register as admin. The service must still set role = 'user' itself.
 * - name: 1-80 chars after trimming
 * - email: trimmed, lowercased, valid format
 * - password: at least 8 characters, at most 72 BYTES (bcrypt's input limit,
 *   measured with Buffer.byteLength so multi-byte characters count correctly)
 */
const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(80, 'Name must not exceed 80 characters'),

  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Invalid email format')),

  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .refine((val) => Buffer.byteLength(val, 'utf8') <= 72, {
      message: 'Password is too long (maximum 72 bytes)',
    }),
});

/**
 * Login schema.
 *
 * The email is normalised exactly like registration (trim + lowercase) so
 * "Alice@Example.com" finds the account stored as "alice@example.com".
 * Format is deliberately not validated: the service returns one generic 401
 * for any bad credentials, so nothing is revealed about which field was wrong.
 */
const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .min(1, 'Email is required'),

  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema };