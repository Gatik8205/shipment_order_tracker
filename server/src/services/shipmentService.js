const Shipment = require('../models/Shipment');
const { canTransition, allowedNext } = require('../utils/transitions');
const { ApiError } = require('../utils/ApiError');
const { generateTrackingId } = require('../utils/generateTrackingId');

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

/**
 * Convert a populated Mongoose Shipment document to a plain response object.
 * Expects history.actor to be populated with at least { _id, name }.
 * If populate returned null (user deleted), falls back to { id: null, name: 'Deleted user' }.
 *
 * @param {object} doc - Mongoose document or lean object
 * @returns {object}
 */
function toShipmentDTO(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };

  obj.history = (obj.history || []).map((entry) => {
    const actor = entry.actor;
    let actorDTO;
    if (!actor) {
      actorDTO = { id: null, name: 'Deleted user' };
    } else if (typeof actor === 'object' && actor.name !== undefined) {
      // populated document / sub-object
      actorDTO = { id: actor._id ?? actor.id ?? null, name: actor.name };
    } else {
      // unpopulated ObjectId (shouldn't happen in normal flow, but guard it)
      actorDTO = { id: actor, name: 'Deleted user' };
    }

    return {
      from: entry.from ?? null,
      to: entry.to,
      note: entry.note,
      at: entry.at,
      actor: actorDTO,
    };
  });

  obj.allowed = allowed(obj.status);
  return obj;
}

// ---------------------------------------------------------------------------
// createShipment
// ---------------------------------------------------------------------------

const EDITABLE_FIELDS = ['title', 'origin', 'destination', 'recipient'];

/**
 * Create a new shipment for the given actor.
 * Retries up to 5 times on trackingId collisions before giving up.
 *
 * @param {{ actor: object, data: object }} params
 * @returns {object} DTO with populated history actor
 */
async function createShipment({ actor, data }) {
  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const trackingId = generateTrackingId();
    const now = new Date();

    try {
      const doc = await Shipment.create({
        ...data,
        trackingId,
        status: 'CREATED',
        createdBy: actor._id,
        history: [{ from: null, to: 'CREATED', actor: actor._id, at: now }],
      });

      // Populate history actor names before returning
      await doc.populate('history.actor', 'name');
      return toShipmentDTO(doc);
    } catch (err) {
      const isDuplicateTrackingId =
        err.code === 11000 && err.keyPattern && err.keyPattern.trackingId;

      if (isDuplicateTrackingId) {
        if (attempt === MAX_ATTEMPTS) {
          throw new ApiError(500, 'Could not generate a unique tracking id');
        }
        // retry with a new trackingId
        continue;
      }

      throw err; // any other error bubbles up
    }
  }
}

// ---------------------------------------------------------------------------
// listShipments
// ---------------------------------------------------------------------------

/**
 * List shipments with optional status filter, pagination, and role-based scoping.
 *
 * @param {{ actor: object, query: { status?: string, page: number, limit: number } }} params
 * @returns {{ data: object[], total: number, page: number, limit: number }}
 */
async function listShipments({ actor, query }) {
  const { status, page, limit } = query;

  const filter = {};
  if (actor.role === 'user') {
    filter.createdBy = actor._id;
  }
  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Shipment.find(filter)
      .select('-history')
      .sort({ createdAt: -1, _id:-1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Shipment.countDocuments(filter),
  ]);

  return { data, total, page, limit };
}

// ---------------------------------------------------------------------------
// getShipmentById
// ---------------------------------------------------------------------------

/**
 * Fetch a single shipment by id, enforcing ownership for non-admin actors.
 *
 * @param {{ actor: object, id: string }} params
 * @returns {object} DTO with populated history actor
 */
async function getShipmentById({ actor, id }) {
  const shipment = await Shipment.findById(id).populate('history.actor', 'name');

  const notFound =
    !shipment ||
    (actor.role === 'user' && !shipment.createdBy.equals(actor._id));

  if (notFound) throw new ApiError(404, 'Shipment not found');

  return toShipmentDTO(shipment);
}

// ---------------------------------------------------------------------------
// editShipment
// ---------------------------------------------------------------------------

/**
 * Edit the mutable fields of a CREATED shipment.
 * Only the owner may edit; admins and other users receive 404.
 *
 * @param {{ actor: object, id: string, data: object }} params
 * @returns {object} DTO with populated history actor
 */
async function editShipment({ actor, id, data }) {
  // Build a $set from only the four permitted fields
  const $set = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      $set[field] = data[field];
    }
  }

  const updated = await Shipment.findOneAndUpdate(
    { _id: id, createdBy: actor._id, status: 'CREATED' },
    { $set },
    { new: true, runValidators: true }
  );

  if (!updated) {
    // Distinguish "not found / not owned" from "wrong status"
    const existing = await Shipment.findById(id).lean();

    if (!existing || !existing.createdBy.equals(actor._id)) {
      throw new ApiError(404, 'Shipment not found');
    }

    // Owned but status is not CREATED
    throw new ApiError(409, 'Shipment can no longer be edited');
  }

  await updated.populate('history.actor', 'name');
  return toShipmentDTO(updated);
}

/**
 * Move a shipment to a new status.
 * - Validates the transition against the lifecycle map.
 * - Enforces who may do it (admin: any valid move; owner: cancel while CREATED).
 * - Update + history append happen in ONE findOneAndUpdate, filtered on the
 *   status we read, so concurrent requests cannot both succeed.
 */
async function changeStatus({ shipmentId, to, note, actor }) {
  const shipment = await Shipment.findById(shipmentId);
  const isAdmin = actor.role === 'admin';
  const isOwner = shipment && shipment.createdBy.equals(actor._id);

  // 404 for non-owners so we don't leak that the shipment exists
  if (!shipment || (!isAdmin && !isOwner)) throw new ApiError(404, 'Shipment not found');

  const ownerCancelling = isOwner && to === 'CANCELLED' && shipment.status === 'CREATED';
  if (!isAdmin && !ownerCancelling) throw new ApiError(403, 'Not allowed to change this status');

  if (!canTransition(shipment.status, to)) {
    throw new ApiError(409, `Cannot move from ${shipment.status} to ${to}`, {
      allowed: allowedNext(shipment.status),
    });
  }

  const updated = await Shipment.findOneAndUpdate(
    { _id: shipmentId, status: shipment.status }, // guards against races
    {
      $set: { status: to },
      $push: { history: { from: shipment.status, to, actor: actor._id, note } },
    },
    { new: true }
  );

  if (!updated) {
    const current = await Shipment.findById(shipmentId).lean();
    const currentStatus = current ? current.status : shipment.status;
    throw new ApiError(409, 'Shipment was updated by someone else, please retry', {
      allowed: allowedNext(currentStatus),
    });
  }

  await updated.populate('history.actor', 'name');
  return toShipmentDTO(updated);
}

module.exports = {
  toShipmentDTO,
  createShipment,
  listShipments,
  getShipmentById,
  editShipment,
  changeStatus,
};
