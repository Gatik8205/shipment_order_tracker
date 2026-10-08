const Shipment = require('../models/Shipment');
const { canTransition, allowedNext } = require('../utils/transitions');

class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
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

  if (!updated) throw new ApiError(409, 'Shipment was updated by someone else, please retry');
  return updated;
}

module.exports = { changeStatus, ApiError };
