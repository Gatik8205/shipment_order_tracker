# Design: Shipment Tracker

## Architecture
React (Vite) SPA -> REST API (Express) -> MongoDB (Mongoose).
Server layers: routes -> controllers -> services -> models.
- Routes: URL + middleware wiring only.
- Controllers: parse request, call a service, shape the response.
- Services: business rules (transition validation, ownership checks).
- Models: schema and indexes only.

## Folder structure
```
server/
  src/
    config/        db.js, env.js
    models/        User.js, Shipment.js
    middleware/    auth.js, requireRole.js, validate.js, errorHandler.js
    routes/        auth.routes.js, shipment.routes.js
    controllers/   auth.controller.js, shipment.controller.js
    services/      authService.js, shipmentService.js
    utils/         transitions.js, ApiError.js, generateTrackingId.js
  tests/           transitions.test.js
client/
  src/
    api/           client.js (axios + interceptor), shipments.js, auth.js
    context/       AuthContext.jsx
    pages/         Login, Register, Dashboard, ShipmentDetail, NewShipment
    components/    StatusBadge, Timeline, ProtectedRoute, Pagination
```

## API
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/register | public | create account |
| POST | /api/auth/login | public | get JWT |
| GET | /api/auth/me | auth | current user |
| GET | /api/shipments | auth | list (scoped by role), filter + paginate |
| POST | /api/shipments | auth | create |
| GET | /api/shipments/:id | auth | detail + history |
| PATCH | /api/shipments/:id | owner | edit while CREATED |
| POST | /api/shipments/:id/status | admin (or owner for cancel) | transition |

## Data model decisions
- History is an embedded array on Shipment. Trade-off: status change and history append happen in one document update, so it is atomic without transactions. Cost: the document grows, which is fine at this scale (a shipment has well under 20 events).
- Race safety: status update uses `findOneAndUpdate({_id, status: current})`. If another request changed it first, the filter misses and we return 409.
- Index: `{ createdBy: 1, status: 1, createdAt: -1 }` for the scoped, filtered list query. `trackingId` is unique.

## Security
bcrypt (cost 10), JWT in Authorization header, helmet, express-rate-limit on /auth, input validation with zod, centralized error handler that never leaks stack traces in production.
