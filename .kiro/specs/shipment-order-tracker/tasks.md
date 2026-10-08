# Tasks

## Overview
Ordered implementation plan for Shipment Order Tracker. Tasks marked *(exists)* reference
files already in the repo; they are edited only where a task says so. Tasks marked **[manual]**
are done by hand (boilerplate that does not need AI credits). Commit after every top-level task
group, with a conventional message; commit AI output and any fixes to it separately.

All server code lives under `server/src/`, except `server/tests/` and `server/scripts/`.

---

- [ ] 1. Repo scaffold and configuration
  - [ ] 1.1 **[manual]** Create the `server/src/` tree: `config/`, `middleware/`, `routes/`, `controllers/`, `services/`, `utils/`, `schemas/`
  - [ ] 1.2 **[manual]** Move existing files into `server/src/`: `models/` → `src/models/`, `utils/transitions.js` → `src/utils/`, `services/shipmentService.js` → `src/services/`. Keep `server/tests/`. Fix the relative `require` paths (including those in `tests/transitions.test.js`) and run `node --test tests/transitions.test.js` to confirm 5 passing tests. Do not change logic.
  - [ ] 1.3 **[manual]** Create `server/.env.example` with `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV`
  - [ ] 1.4 **[manual]** Create `server/package.json` scripts: `start`, `dev` (nodemon), `test` (`node --test tests/`), `seed`
  - [ ] 1.5 **[manual]** Install server dependencies: `express`, `mongoose`, `bcryptjs`, `jsonwebtoken`, `zod`, `helmet`, `cors`, `express-rate-limit`, `dotenv`; dev: `nodemon`, `mongodb-memory-server`
  - [ ] 1.6 Update `src/models/Shipment.js` *(exists)* to match the design: `maxlength` 200 on `origin` and `destination`, 120 on `recipient`; `trim` on all string fields; add index `{ status: 1, createdAt: -1 }`. Commit as a fix.

- [ ] 2. Server bootstrap
  - [ ] 2.1 **[manual]** `src/config/env.js` — load and validate env vars; fail fast with a clear message if `MONGO_URI` or `JWT_SECRET` is missing; export `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV`
  - [ ] 2.2 **[manual]** `src/config/db.js` — `connectDB()` wrapping `mongoose.connect`
  - [ ] 2.3 **[manual]** `src/utils/ApiError.js` — `ApiError(status, message, extra)`; then change `shipmentService.js` to import it instead of defining its own class
  - [ ] 2.4 `src/middleware/errorHandler.js` — uses `ApiError.status` and merges `extra` (`allowed`, `errors`) into the body; unknown errors become 500 with a generic message; includes `stack` only when `NODE_ENV !== 'production'`
  - [ ] 2.5 `src/middleware/validate.js` — factory `validate(schema, source = 'body')` for `'body' | 'query' | 'params'`; on failure calls `next(new ApiError(422, 'Validation failed', { errors: [{ field, reason }] }))`. A `params` failure for an invalid ObjectId must produce 404, not 422 (add a `validateObjectId` helper)
  - [ ] 2.6 `src/app.js` — builds and exports the Express app (helmet defaults, cors restricted to `CLIENT_ORIGIN`, JSON body parser, routers, errorHandler) without listening; `server/index.js` connects the DB and calls `app.listen`

- [ ] 3. Authentication
  - [ ] 3.1 `src/middleware/auth.js` — verify `Authorization: Bearer <token>`; read `sub` from the token; load the user from the database; if the user does not exist return 401; attach the DB user as `req.actor` (role comes from the DB, never the token); 401 for missing, expired, or malformed tokens without leaking token contents
  - [ ] 3.2 `src/middleware/requireRole.js` — `requireRole(role)`; 403 when `req.actor.role !== role`
  - [ ] 3.3 `src/schemas/auth.schemas.js` — Zod: register (name 1–80 trimmed, email valid and lowercased, password 8–72 **bytes** via `Buffer.byteLength`), login (email, password required)
  - [ ] 3.4 `src/services/authService.js` — `register` (case-insensitive duplicate check by lowercased email, and also handle the duplicate-key error → 409 "Email already registered"; bcryptjs cost 10; sign a 24h JWT with `sub`) and `login` (generic 401 for unknown email or wrong password)
  - [ ] 3.5 `src/controllers/auth.controller.js` — thin handlers; responses `{ token, user: { id, name, email, role } }`; `me` returns the actor profile
  - [ ] 3.6 `src/routes/auth.routes.js` — `POST /register`, `POST /login` (each with a rate limiter: 20 requests / 15 minutes / IP, 429 beyond), `GET /me` (auth only, **not** rate limited)
  - [ ] 3.7 Test every auth endpoint in Postman (register, duplicate, login, wrong password, `/me`, expired/garbage token) and save the Postman collection to `docs/postman/`

- [ ] 4. Shipment endpoints
  - [ ] 4.1 `src/utils/generateTrackingId.js` — `'TRK-' + randomBytes(5).toString('hex').toUpperCase()`; generation only (collision handling is in `createShipment`)
  - [ ] 4.2 `src/schemas/shipment.schemas.js` — Zod: create (title ≤120, origin ≤200, destination ≤200, recipient ≤120, all non-empty trimmed), patch (same fields optional, at least one non-empty), list query (`status` enum, `page` ≥1, `limit` 1–100, defaults 1 and 20), status change (`to` enum, optional `note` ≤280)
  - [ ] 4.3 Extend `src/services/shipmentService.js` — add `createShipment`, `listShipments`, `getShipmentById`, `editShipment`:
    - `createShipment`: set status CREATED, `createdBy`, first history entry `{ from: null, to: 'CREATED', actor, at }`; on duplicate-key error for `trackingId` regenerate and retry, 5 attempts total, then `ApiError(500)`; never check-then-insert
    - `listShipments`: users see only their own, admins see all; filter by `status`; sort `createdAt` desc; return `{ data, total, page, limit }`; omit `history` from list items
    - `getShipmentById`: 404 for a missing id or a non-owner user; admin sees any; populate `history.actor` with `name` and return `actor: { id, name }`
    - `editShipment`: owner only (admin and other users get 404); 409 if status is not CREATED; apply only permitted fields
  - [ ] 4.4 Amend the existing `changeStatus` minimally *(exists)*: import the shared `ApiError`; include `allowed` in the race 409; return the shipment with `history.actor` populated. Do not alter the permission or transition logic, which already matches the authorization matrix.
  - [ ] 4.5 `src/controllers/shipment.controller.js` — thin handlers for create (201), list, get, patch, status
  - [ ] 4.6 `src/routes/shipment.routes.js` — all routes behind `auth`; `:id` validated as ObjectId (404 on failure); body/query validated with the schemas
  - [ ] 4.7 Test every shipment endpoint in Postman with both an admin and a user token, covering each cell of the authorization matrix, and add the requests to the saved collection

- [ ] 5. Automated tests
  - [ ] 5.1 Run `server/tests/transitions.test.js` *(exists)* — must pass
  - [ ] 5.2 `server/tests/shipmentService.test.js` using `mongodb-memory-server` and `node:test`:
    - concurrent `changeStatus` to the same target: exactly one succeeds, the other gets 409, and exactly one history entry is appended
    - permissions: non-owner gets 404; owner requesting PICKED_UP gets 403; owner cancelling a CREATED shipment succeeds; admin edit gets 404
    - history integrity: earlier entries unchanged after a transition; new entry's `from` equals the prior status
    - TrackingId retry: a forced duplicate-key error on `trackingId` is retried and succeeds
  - [ ] 5.3 Run the whole suite with `npm test` and commit

- [ ] 6. Seed script
  - [ ] 6.1 `server/scripts/seed.js` — refuse to run (message + non-zero exit, no DB access) when `NODE_ENV === 'production'`; build all documents in memory first: 1 admin, 2 users (bcryptjs hashes), exactly 12 shipments covering all 5 statuses, each with one history entry per traversed transition and increasing timestamps; validate; delete existing `users` and `shipments` documents; `insertMany` once per collection (no transactions); on any error print the message and exit non-zero; on success print name, email, plaintext password and role of each account
  - [ ] 6.2 Run it twice to confirm it is repeatable, then commit

- [ ] 7. Client scaffold
  - [ ] 7.1 **[manual]** Scaffold Vite + React in `client/`
  - [ ] 7.2 **[manual]** Install `react-router-dom`, `axios`
  - [ ] 7.3 `client/src/api/client.js` — Axios instance on `VITE_API_URL`; request interceptor attaches the JWT except for `/auth/login` and `/auth/register`; response interceptor on 401 clears auth, removes the token from localStorage and redirects to `/login`, but never for a 401 from the login request itself
  - [ ] 7.4 `client/src/api/auth.js` — `register`, `login`, `me`
  - [ ] 7.5 `client/src/api/shipments.js` — `createShipment`, `listShipments`, `getShipment`, `updateShipment`, `changeShipmentStatus`
  - [ ] 7.6 `client/src/context/AuthContext.jsx` — `{ user, token, loading }`; `login(token, user)`, `logout()`; on startup restore the token from localStorage and verify it with `/me` before rendering protected pages

- [ ] 8. Routing and shared components
  - [ ] 8.1 `ProtectedRoute.jsx` — redirect unauthenticated actors to `/login`, storing the requested location so login can return to it; wait for `loading` before redirecting
  - [ ] 8.2 `StatusBadge.jsx` — coloured pill per status
  - [ ] 8.3 `Timeline.jsx` — vertical, chronological; status label, formatted timestamp, `actor.name`, note if present
  - [ ] 8.4 `Pagination.jsx` — previous/next, disabled while loading and at the ends
  - [ ] 8.5 `LoadingSpinner.jsx`
  - [ ] 8.6 `App.jsx` — routes: `/login`, `/register`, `/` (Dashboard), `/shipments/new`, `/shipments/:id`; the last three protected

- [ ] 9. Client pages
  - [ ] 9.1 `Login.jsx` — client-side check for empty fields (no request sent); loading state with disabled submit; show server message and clear the password on error; return to the originally requested route on success
  - [ ] 9.2 `Register.jsx` — client-side checks (password ≥ 8 characters, valid email); same loading and error behaviour
  - [ ] 9.3 `Dashboard.jsx` — fetch list; status filter (resets to page 1); `Pagination`; disable filter and pagination while loading; server error shown in place of the list; two distinct empty states (no shipments yet / none match the filter); link to New Shipment
  - [ ] 9.4 `NewShipment.jsx` — client-side required and length checks per field; field-level errors from a 422 response; loading state; redirect to the detail page on success
  - [ ] 9.5 `ShipmentDetail.jsx` — fetch and render `Timeline`; admin sees one button per allowed next state on non-terminal shipments; owner sees Cancel while CREATED; disable all controls and show a spinner during a change; show API errors inline; re-fetch after success; if the initial fetch fails show only an error message

- [ ] 10. Polish and cross-cutting checks
  - [ ] 10.1 Verify loading, error and empty states on every page
  - [ ] 10.2 Verify admin-only controls are hidden from users (and that the server still rejects the calls)
  - [ ] 10.3 **[manual]** `client/.env.example` with `VITE_API_URL=http://localhost:5000`
  - [ ] 10.4 Confirm no component or page calls `axios` directly — everything goes through `src/api/`
  - [ ] 10.5 Fresh-clone test: clone the repo into a new folder, follow only the README, and confirm server, seed, client and tests all work

- [ ] 11. README and submission
  - [ ] 11.1 **[manual]** Write the root `README.md`: overview with screenshots, prerequisites, setup (server and client), env variable table, API endpoint table matching `design.md`, seed instructions and demo credentials, how to run tests
  - [ ] 11.2 **[manual]** Add a "How I used Kiro" section: spec-driven workflow, which tasks Kiro generated versus which were done by hand, and a list of specific AI mistakes caught with their fixing commits
  - [ ] 11.3 **[manual]** Add a "Design decisions and trade-offs" section: embedded history, atomic race guard, 404 vs 403, localStorage token, registration user-enumeration
  - [ ] 11.4 **[manual]** Confirm the repo is public, the `.kiro/specs` folder is committed, `.env` is not committed, and the commit history is clean; send the repository link