const mongoose = require('mongoose');
const { STATUSES } = require('../utils/transitions');

const statusValues = Object.values(STATUSES);

// Immutable audit entry. _id disabled: entries are only ever appended.
const historySchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...statusValues, null], default: null },
    to: { type: String, enum: statusValues, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, maxlength: 280 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    recipient: { type: String, required: true, trim: true },
    status: { type: String, enum: statusValues, default: STATUSES.CREATED },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

// Supports the scoped + filtered + sorted list query
shipmentSchema.index({ createdBy: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
