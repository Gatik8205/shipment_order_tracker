const { Router } = require('express');
const auth = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const {
  listQuerySchema,
  createShipmentSchema,
  patchShipmentSchema,
  statusChangeSchema,
} = require('../schemas/shipment.schemas');
const { create, list, get, patch, changeStatus } = require('../controllers/shipment.controller');

const router = Router();

// Every route requires a valid JWT / authenticated actor.
router.use(auth);

// GET  /shipments            — list (role-scoped inside service)
router.get('/', validate(listQuerySchema, 'query'), list);

// POST /shipments            — create a new shipment
router.post('/', validate(createShipmentSchema), create);

// GET  /shipments/:id        — fetch one shipment
router.get('/:id', validateObjectId, get);

// PATCH /shipments/:id       — edit editable fields
router.patch('/:id', validateObjectId, validate(patchShipmentSchema), patch);

// POST /shipments/:id/status — transition status
// Note: no requireRole('admin') — the service enforces who may do what
//       (owners may cancel their own CREATED shipments; admins can do the rest)
router.post('/:id/status', validateObjectId, validate(statusChangeSchema), changeStatus);

module.exports = router;
