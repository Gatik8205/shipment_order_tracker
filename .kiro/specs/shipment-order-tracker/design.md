# Design Document

## Overview

Shipment Order Tracker is a full-stack MERN application. The backend is an Express.js REST
API backed by MongoDB (via Mongoose). The frontend is a React (Vite) SPA. All communication
uses JSON over HTTP. Authentication is JWT-based; the token is stored in `localStorage` on
the client and sent as an `Authorization: Bearer` header.

---

## Architecture

```
React SPA (Vite)
     |
     | HTTP/JSON
     v
Express REST API  ──►  MongoDB (Mongoose)
```

### Backend layer responsibilities

| Layer | Responsibility |
|---|---|
| Routes | URL wiring and middleware chain only — no logic |
| Controllers | Parse request, call one service method, shape HTTP response |
| Services | All business rules: ownership checks, transition validation, atomic writes |
| Models | Mongoose schema and index definitions only |
| Middleware | Auth (JWT verify + user lookup), requireRole, validate (Zod), errorHandler |
| Utils | Stateless helpers: transitions.js, ApiError.js, generateTrackingId.js |

---

## Folder Structure

```
server/
  src/
    config/
      db.js                    – mongoose.connect wrapper
      env.js                   – validated env vars (MONGO_URI, JWT_SECRET, PORT,
                                  CLIENT_ORIGIN, NODE_ENV); fails fast if missing
    models/
      User.js                  – (existing) name, email, passwordHash, role
      Shipment.js              – (existing, to update) see Data Models
    middleware/
      auth.js                  – verify JWT, load user from DB, attach req.actor
      requireRole.js           – factory: requireRole('admin')
      validate.js              – factory: validate(zodSchema, 'body' | 'query' | 'params')
      errorHandler.js          – centralized handler (see Error format)
    routes/
      auth.routes.js
      shipment.routes.js
    controllers/
      auth.controller.js
      shipment.controller.js
    services/
      authService.js           – register, login
      shipmentService.js       – (existing) changeStatus; add create, list, getById, edit
    utils/
      transitions.js           – (existing) STATUSES, ALLOWED, allowedNext, canTransition
      ApiError.js              – (extract from shipmentService.js)
      generateTrackingId.js    – "TRK-" + 10 uppercase hex chars from crypto.randomBytes(5)
  tests/
    transitions.test.js        – (existing) node:test runner
    shipmentService.test.js    – service-level tests (race, permissions) using
                                  mongodb-memory-server
  scripts/
    seed.js
  .env.example
  package.json

client/
  src/
    api/
      client.js                – axios instance; request interceptor attaches JWT except
                                  for /auth/login and /auth/register; response interceptor
                                  handles 401 (skips the login request itself)
      auth.js                  – register, login, me
      shipments.js             – createShipment, listShipments, getShipment,
                                  updateShipment, changeShipmentStatus
    context/
      AuthContext.jsx          – { user, token }, login/logout helpers, restores
                                  session from localStorage then verifies via /me
    components/
      ProtectedRoute.jsx       – redirects to /login, preserving the requested route
      StatusBadge.jsx
      Timeline.jsx
      Pagination.jsx
      LoadingSpinner.jsx
    pages/
      Login.jsx
      Register.jsx
      Dashboard.jsx
      NewShipment.jsx
      ShipmentDetail.jsx
    App.jsx
    main.jsx
  index.html
  vite.config.js
  package.json
```

---

## API Endpoints

| Method | Path | Auth | Who | Purpose |
|---|---|---|---|---|
| POST | /api/auth/register | — | anyone | Create account, return JWT (rate limited) |
| POST | /api/auth/login | — | anyone | Verify credentials, return JWT (rate limited) |
| GET | /api/auth/me | JWT | any | Return current actor profile (not rate limited) |
| GET | /api/shipments | JWT | any | List (scoped by role), filter + paginate |
| POST | /api/shipments | JWT | any | Create shipment |
| GET | /api/shipments/:id | JWT | owner or admin | Detail + history |
| PATCH | /api/shipments/:id | JWT | owner only | Edit while CREATED; admin and non-owner users get 404 |
| POST | /api/shipments/:id/status | JWT | admin for all transitions; owner for cancel-while-CREATED only | Transition status |

### Authorization matrix

| Action | Owner (user) | Other user | Admin |
|---|---|---|---|
| GET detail | 200 | 404 | 200 |
| PATCH edit (Status = CREATED) | 200 | 404 | 404 |
| PATCH edit (Status ≠ CREATED) | 409 | 404 | 404 |
| POST /:id/status — cancel while CREATED | 200 | 404 | 200 |
| POST /:id/status — valid non-cancel transition | 403 | 404 | 200 |
| POST /:id/status — invalid transition | 403 | 404 | 409 |

Notes:
- PATCH is owner-only. An Admin attempting to edit a Shipment receives 404, not 403.
- A non-owner User attempting any status change (`POST /:id/status`) receives 404 (existence not revealed).
- An owner User attempting a status transition not covered by the cancel-while-CREATED rule receives 403 (resource is visible to the owner, but the specific action is forbidden).

Invalid ObjectId in `:id` returns 404 for every route.

### Request / Response shapes

**POST /api/auth/register** and **POST /api/auth/login**
```json
// register request
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }
// response (201 register, 200 login)
{ "token": "<JWT>", "user": { "id": "...", "name": "Alice", "email": "alice@example.com", "role": "user" } }
// 409 duplicate email — body is always exactly:
{ "message": "Email already registered" }
// This is an accepted user-enumeration trade-off: registration reveals whether an email is taken.
// Login (POST /api/auth/login) always returns a generic 401 and does not reveal which field was wrong.
// This trade-off is documented in the README.
// 422 missing or invalid fields
{ "message": "Validation failed", "errors": [ { "field": "email", "reason": "Invalid email format" } ] }
```

**GET /api/shipments?status=&page=&limit=**
```json
{ "data": [ { "_id": "...", "trackingId": "TRK-A1B2C3D4E5", "title": "...", "status": "CREATED" } ],
  "total": 42, "page": 1, "limit": 20 }
```
The list omits the `history` array. Defaults: page 1, limit 20, max 100.

**POST /api/shipments**
```json
// request
{ "title": "Laptop", "origin": "New York", "destination": "Los Angeles", "recipient": "Bob" }
// 201 response
{ "_id": "...", "trackingId": "TRK-A1B2C3D4E5", "title": "Laptop", "status": "CREATED", "history": [ ... ] }
```

**GET /api/shipments/:id** returns the shipment with each history entry's actor populated:
```json
{ "...": "...",
  "history": [ { "from": null, "to": "CREATED", "actor": { "id": "...", "name": "Alice" },
                 "note": null, "at": "2026-10-08T07:00:00.000Z" } ] }
```

**POST /api/shipments/:id/status**
```json
// request (note optional, max 280)
{ "to": "PICKED_UP", "note": "Collected from warehouse" }
// 200: full updated Shipment (history populated as above)
// 422 missing/unrecognised `to` or note > 280 chars: { "message": "Validation failed", "errors": [...] }
// 409 invalid transition: { "message": "Cannot move from X to Y", "allowed": ["Z"] }
// 409 race:               { "message": "Shipment was updated by someone else, please retry",
//                           "allowed": ["Z"] }
```

> **Validation note**: a missing or unrecognised `to` value, or a `note` exceeding 280 characters, returns HTTP 422 (not 409). Only a recognised-but-disallowed transition returns 409.

### Error format

```json
{ "message": "Validation failed",
  "errors": [ { "field": "title", "reason": "Required" } ],   // only for 422
  "allowed": ["..."],                                           // only for 409 transitions
  "stack": "..." }                                              // only when NODE_ENV != production
```

Status codes: 401 unauthenticated, 403 forbidden action on a visible resource, 404 missing
or not visible, 409 conflict, 422 validation (all validation failures — missing fields,
type errors, constraint violations — use 422, never 400), 429 rate limit, 500 unexpected.

---

## Data Models

### User

```
name          String   required  trim  maxlength 80
email         String   required  unique  lowercase  trim
passwordHash  String   required  select: false
role          String   enum ['user','admin']  default 'user'
timestamps    createdAt, updatedAt
```

`toJSON` removes `passwordHash` and `__v`. Passwords are validated by Zod as 8–72 bytes
(`Buffer.byteLength`) before hashing.

### Shipment

```
trackingId    String   required  unique
title         String   required  trim  maxlength 120
origin        String   required  trim  maxlength 200
destination   String   required  trim  maxlength 200
recipient     String   required  trim  maxlength 120
status        String   enum [STATUSES]  default 'CREATED'
createdBy     ObjectId ref 'User'  required
history       [HistoryEntry]  default []
timestamps    createdAt, updatedAt
```

Compound index: `{ createdBy: 1, status: 1, createdAt: -1 }` for the scoped, filtered list.
Admin list (all owners) is served by the `createdAt` ordering; add `{ status: 1, createdAt: -1 }`.

### HistoryEntry (embedded sub-document, `_id: false`)

```
from    String   enum [...statusValues, null]  default null
to      String   enum [statusValues]  required
actor   ObjectId ref 'User'  required
note    String   trim  maxlength 280
at      Date     default Date.now
```

---

## Key Design Decisions

### Atomic status change with race guard

`changeStatus` runs one `findOneAndUpdate` filtered on both `_id` and the status read by the
preceding `findById`, setting the new status and `$push`ing the history entry in the same
operation. If a concurrent request changed the status first, the filter matches nothing and
the API returns 409. No multi-document transaction is needed.

### Embedded history array

History lives inside the Shipment document, so the status update and history append are one
atomic document write. Trade-off: the document grows, acceptable because a shipment passes
through at most 4 transitions. Actor names are resolved with `populate('history.actor', 'name')`
on read, not stored on the entry.

### TrackingId generation

`"TRK-" + randomBytes(5).toString('hex').toUpperCase()`. Uniqueness is enforced by the unique
index, not by a prior lookup: on a duplicate-key error (code 11000) on `trackingId`, generate
a new id and retry, up to **5 total attempts**; if all 5 attempts fail, return HTTP 500 without
persisting any partial document. This avoids the check-then-insert race entirely — no existence
check is performed before the insert.

### 404 versus 403

A resource the actor may not see is 404. 403 is used only when the actor can see the
resource but the specific action is forbidden (owner attempting a non-cancel transition).
This follows the Conventions in the requirements.

### Auth middleware

The JWT carries only the user id (`sub`) and expiry. On each request the middleware verifies
the token, then loads the user from the database; a missing user returns 401. The role is
always read from the database, never trusted from the token.

### Single TransitionMap

All lifecycle logic lives in `utils/transitions.js`. The service, tests and UI controls all
derive from it. The client receives `allowed` states from the API rather than duplicating
the map.

### Seed script

Refuses to run when `NODE_ENV=production` — prints an explanatory message and exits with a
non-zero code without touching the database. Builds all User and Shipment documents in memory
first (including a history entry per traversed transition, with increasing timestamps) and
validates them before any database write. Deletes existing `users` and `shipments` collections,
then calls `insertMany` once per collection. No multi-document transactions are used (unavailable
on a standalone MongoDB). On any validation or insertion error, the script halts, prints the
error message to stdout, and exits with a non-zero code — no documents from a failed insert
remain. On success, it prints the name, email, plaintext password, and role of every created
account to stdout.

### Centralized error handling

`ApiError` carries an HTTP status and optional extras (`allowed`, `errors`). `errorHandler`
converts it to the response above; unrecognized errors become 500 with a generic message.
Stack traces are included only outside production.

### JWT storage

The token is stored in `localStorage` (accepted trade-off: readable if an XSS flaw exists;
documented in the README). The Axios interceptor attaches it and handles 401 globally.

---

## Security Measures

| Concern | Measure |
|---|---|
| Password storage | bcryptjs cost 10; 8–72 byte limit |
| Token expiry | 24-hour JWT; user re-loaded from DB each request |
| Rate limiting | express-rate-limit on POST /login and POST /register only (20 / 15 min / IP) |
| Secure headers | helmet with defaults on all responses |
| CORS | cors middleware allowing only `CLIENT_ORIGIN` |
| Input validation | Zod on body, query and params for every endpoint |
| Query injection | Mongoose parameterised queries only; `:id` validated as ObjectId |
| Hash leakage | `select: false` plus `toJSON` transform |
| Error leakage | No stack traces in production |

---

## Correctness Properties (Testable)

Unit tests (no database), `transitions.test.js`:

1. **Transition invariant**: `canTransition(from, to)` is true exactly when `to` is in `allowedNext(from)`.
2. **Terminal states**: `allowedNext` returns `[]` for DELIVERED and CANCELLED.
3. **Unknown input safety**: `allowedNext` returns `[]` for unknown or non-string values without throwing.
4. **Happy path**: CREATED → PICKED_UP → IN_TRANSIT → DELIVERED is composed of valid transitions.
5. **Skip invariant**: no transition that skips a state returns true.

Service tests (in-memory MongoDB), `shipmentService.test.js`:

6. **Race safety**: two concurrent `changeStatus` calls to the same target produce exactly one success and one 409, and exactly one history entry is appended.
7. **Permissions**: a non-owner user gets 404; an owner attempting PICKED_UP gets 403; an owner cancelling a CREATED shipment succeeds.
8. **History integrity**: after any successful transition the previous history entries are unchanged and the new entry's `from` equals the prior status.
9. **TrackingId uniqueness**: a forced duplicate-key error on `trackingId` triggers a retry and succeeds with a new id.