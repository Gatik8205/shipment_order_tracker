import client from './client.js';

/** Create a new shipment. Returns the created shipment. */
export function createShipment(data) {
  return client.post('/shipments', data).then((r) => r.data);
}

/**
 * List shipments with optional filters.
 * @param {{ status?: string, page?: number, limit?: number }} params
 * Returns { data, total, page, limit }.
 */
export function listShipments(params = {}) {
  return client.get('/shipments', { params }).then((r) => r.data);
}

/** Get a single shipment including its history[]. */
export function getShipment(id) {
  return client.get(`/shipments/${id}`).then((r) => r.data);
}

/** Update shipment fields (e.g. origin, destination). */
export function updateShipment(id, data) {
  return client.patch(`/shipments/${id}`, data).then((r) => r.data);
}

/**
 * Advance the shipment status.
 * @param {string} id
 * @param {{ to: string, note?: string }} data
 */
export function changeShipmentStatus(id, data) {
  return client.post(`/shipments/${id}/status`, data).then((r) => r.data);
}
