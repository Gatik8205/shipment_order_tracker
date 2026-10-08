const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');

/**
 * Factory that returns an Express middleware validating `req[source]`
 * against the provided Zod schema.
 *
 * On success the parsed (trimmed / coerced / defaulted) data is stored on
 * `req.validated[source]`. We do NOT assign back to `req.query`, because it is
 * a read-only getter in Express 5. Controllers must read `req.validated.*`.
 *
 * @param {import('zod').ZodTypeAny} schema  - Zod schema (use plain z.object, no passthrough)
 * @param {'body'|'query'|'params'} source   - Which part of the request to validate
 * @returns {import('express').RequestHandler}
 */
function validate(schema, source = 'body') {
  return function validationMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (result.success) {
      req.validated = req.validated || {};
      req.validated[source] = result.data;
      return next();
    }

    // Map Zod issues to { field, reason } pairs
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || source,
      reason: issue.message,
    }));

    return next(new ApiError(422, 'Validation failed', { errors }));
  };
}

/**
 * Validates that `req.params.id` is a real ObjectId (24-char hex string or
 * ObjectId instance). Returns 404 (not 422) on failure, per the spec:
 * "Invalid ObjectId in :id returns 404 for every route."
 *
 * @type {import('express').RequestHandler}
 */
function validateObjectId(req, res, next) {
  if (mongoose.isObjectIdOrHexString(req.params.id)) {
    return next();
  }
  return next(new ApiError(404, 'Not found'));
}

module.exports = { validate, validateObjectId };