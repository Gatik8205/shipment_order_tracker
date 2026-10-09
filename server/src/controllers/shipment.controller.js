const shipmentService = require('../services/shipmentService');

/**
 * POST /shipments
 * Create a new shipment. Responds 201 with the created shipment DTO.
 */
async function create(req, res, next) {
  try {
    const shipment = await shipmentService.createShipment({
      actor: req.actor,
      data: req.validated.body,
    });
    res.status(201).json(shipment);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shipments
 * List shipments (scoped by role inside the service). Responds 200.
 */
async function list(req, res, next) {
  try {
    const result = await shipmentService.listShipments({
      actor: req.actor,
      query: req.validated.query,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shipments/:id
 * Fetch a single shipment by id. Responds 200.
 */
async function get(req, res, next) {
  try {
    const shipment = await shipmentService.getShipmentById({
      actor: req.actor,
      id: req.params.id,
    });
    res.status(200).json(shipment);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /shipments/:id
 * Edit editable fields of a shipment. Responds 200.
 */
async function patch(req, res, next) {
  try {
    const shipment = await shipmentService.editShipment({
      actor: req.actor,
      id: req.params.id,
      data: req.validated.body,
    });
    res.status(200).json(shipment);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /shipments/:id/status
 * Transition a shipment's status. Responds 200.
 */
async function changeStatus(req, res, next) {
  try {
    const shipment = await shipmentService.changeStatus({
      actor: req.actor,
      shipmentId: req.params.id,
      to: req.validated.body.to,
      note: req.validated.body.note,
    });
    res.status(200).json(shipment);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, get, patch, changeStatus };
