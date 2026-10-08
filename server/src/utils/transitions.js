const STATUSES = Object.freeze({
  CREATED: 'CREATED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

// Single source of truth for the lifecycle. Terminal states map to [].
const ALLOWED = Object.freeze({
  CREATED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
});

const allowedNext = (from) => ALLOWED[from] ?? [];
const canTransition = (from, to) => allowedNext(from).includes(to);

module.exports = { STATUSES, ALLOWED, allowedNext, canTransition };
