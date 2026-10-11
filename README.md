# Shipment Order Tracker

A small MERN application for creating shipments and tracking them through a validated status lifecycle. Every status change is stored in an append-only history, so each shipment has a full audit trail.


## Features

- Register / login with JWT authentication (24h tokens, bcrypt-hashed passwords)
- Two roles: **user** (owns shipments) and **admin** (advances any shipment)
- Create, list (filter + pagination), view and edit shipments
- Status lifecycle: `CREATED -> PICKED_UP -> IN_TRANSIT -> DELIVERED`, with `CANCELLED` allowed from `CREATED` or `PICKED_UP`
- Invalid transitions are rejected on the server (409) with the list of allowed next states
- Vertical timeline of every change (who, when, optional note)
- Race-safe status updates: two simultaneous requests cannot both succeed

## Tech stack

MongoDB + Mongoose, Express 5, Node.js 22, React (Vite) with React Router and Axios. Validation with Zod. Tests with the built-in `node:test` runner and `mongodb-memory-server`.

## Project structure

```
.kiro/specs/shipment-order-tracker/   requirements.md, design.md, tasks.md (spec-driven workflow)
server/
  index.js                 entry point (connects to MongoDB, starts the server)
  src/
    app.js                 Express app (helmet, cors, routes, error handler)
    config/                env validation, DB connection
    models/                User, Shipment (history embedded)
    middleware/            auth, requireRole, validate, errorHandler
    routes/ controllers/   thin HTTP layer
    services/              business rules (ownership, transitions, atomic updates)
    schemas/               Zod request schemas
    utils/                 transitions.js (single source of truth), ApiError, generateTrackingId
  scripts/seed.js          demo data
  tests/                   unit + API tests
client/
  src/api/                 axios client + API functions (pages never call axios directly)
  src/context/             AuthContext
  src/components/ pages/   UI
```

## Getting started

Prerequisites: Node.js 22+, a MongoDB database (local or MongoDB Atlas).

### 1. Server

```bash
cd server
npm install
cp .env.example .env      # then edit the values (see table below)
npm run seed              # optional: demo data
npm run dev               # http://localhost:5000
```

### 2. Client

```bash
cd client
npm install
cp .env.example .env
npm run dev               # http://localhost:5173
```

### Environment variables (`server/.env`)

| Variable | Description |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGO_URI` | MongoDB connection string, including the database name |
| `JWT_SECRET` | Long random string used to sign tokens |
| `CLIENT_ORIGIN` | Allowed browser origin, e.g. `http://localhost:5173` |
| `NODE_ENV` | `development` or `production` (the seed script refuses to run in production) |

`client/.env`: `VITE_API_URL=http://localhost:5000`

### Demo accounts (after `npm run seed`)

| Role | Email | Password |
|---|---|---|
| admin | admin@seed.dev | Admin1234! |
| user | alice@seed.dev | Alice1234! |
| user | bob@seed.dev | Bob12345! |

`npm run seed` deletes all users and shipments in the configured database, then inserts 3 accounts and 12 shipments covering every status.

### Tests

```bash
cd server
npm test
```

Runs the transition-rule unit tests, the auth and shipment API tests (in-memory MongoDB, no setup needed), the TrackingId retry tests, and a separate rate-limit test.

## API

All routes are under `/api`. Errors are JSON: `{ message, errors?: [{ field, reason }], allowed?: [...] }`.

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create account (role is always `user`) |
| POST | `/auth/login` | public | Returns `{ token, user }` |
| GET | `/auth/me` | auth | Current user |
| GET | `/shipments?status=&page=&limit=` | auth | List (users: own, admins: all). Returns `{ data, total, page, limit }` |
| POST | `/shipments` | auth | Create shipment |
| GET | `/shipments/:id` | owner or admin | Detail with history and `allowed` next states |
| PATCH | `/shipments/:id` | owner only | Edit while status is `CREATED` |
| POST | `/shipments/:id/status` | admin, or owner cancelling | Change status `{ to, note? }` |
| GET | `/health` | public | Liveness check |

Status codes: 401 unauthenticated, 403 forbidden action on a visible resource, 404 missing **or not visible to you**, 409 conflict (invalid transition, race, already left `CREATED`), 422 validation, 429 rate limit.

## Design decisions and trade-offs

- **Embedded history.** History lives inside the Shipment document, so the status change and its log entry are one atomic write, with no transactions. Trade-off: the document grows, which is fine for at most four transitions.
- **Race-safe transitions.** `changeStatus` updates with `findOneAndUpdate` filtered on the status it just read. If another request changed the status first, nothing matches and the API returns 409. Covered by a test that fires 10 simultaneous requests.
- **404 vs 403.** Shipments you may not see return 404 so their existence is not revealed. 403 is used only when you can see the shipment but the action is forbidden.
- **One transition map.** `server/src/utils/transitions.js` is the only place lifecycle rules live. The API returns `allowed` next states, so the client never duplicates the rules.
- **Auth.** The JWT carries only the user id. The user is loaded from the database on every request, so the role is never trusted from the token and deleted users are rejected immediately.
- **Known trade-offs:** the JWT is stored in `localStorage` (readable if an XSS flaw exists); registration says "Email already registered", which reveals that an email exists (login stays generic); the rate-limit store is in memory (per process).

## How I used Kiro

I used Kiro's spec-driven workflow (requirements -> design -> tasks) on the free plan,
which has a 50-credit limit. I planned the credits: Kiro handled the parts with real
logic, and I did boilerplate and review by hand.

### Process
1. **Starting point.** Before opening Kiro, I wrote an initial spec outline and the core
   domain code: the User and Shipment models, the status transition map
   (`utils/transitions.js`), the atomic `changeStatus` service function, and its unit
   tests. I drafted these with help from Claude (a chat assistant).
2. **Spec phase.** In Kiro I started a "Build a Feature" spec session, requirements
   first, and gave it my project description and the existing files. Kiro generated 17
   requirements, a design document and a task list. I did not accept them as generated:
   I read each document, fixed the problems listed below, and committed the corrected
   spec before any code was generated. The spec lives in `.kiro/specs/`.
3. **Implementation phase.** I ran the task list one task at a time with Autopilot off,
   read each diff before accepting it, and committed after each task, with Kiro's output
   and my fixes in separate commits.
4. **Tests.** I had Kiro write the auth and shipment API test suites against an in-memory
   MongoDB, with an instruction not to touch `src/`, so the tests check the code instead
   of adapting to it.

### What Kiro generated
- Requirements, design and task documents (later edited by me)
- Express app wiring, error handler, validation middleware, shared `ApiError`
- JWT auth middleware, auth service, auth routes and controller, Zod schemas
- Shipment service functions (create, list, detail, edit), controller and routes
- Auth and shipment API test suites
- The seed script
- The React client: API layer, auth context, protected routes, dashboard, shipment detail
  with timeline, login/register and new-shipment forms

### What I wrote by hand
- Project structure (moved server code into `src/`), env and DB config, `package.json`
  scripts, `.env` files
- The domain core described above (models, transition map, `changeStatus`)
- Every fix listed in the next section
- This README

### Other tools
I used Claude (chat) as a reviewer and for debugging: to review Kiro's specs and diffs
and suggest fixes, which I then applied myself.

### Problems found in generated output, and how I fixed them
[For each item write how YOU found it and add the commit hash. Keep only the ones you
understood and fixed.]

| Problem | How it was found | Fix |
|---|---|---|
| Spec rate-limited all `/api/auth` routes, which would block `/me` on every page load | Spec review | Limited to login and register only |
| Spec returned 403 for any disallowed status change, leaking that another user's shipment exists | Spec review | 404 for non-owners, 403 only for the owner's disallowed moves |
| Spec claimed CORS returns 403 and fixed exact Helmet header values; neither library does that | Spec review | Reworded to real behaviour |
| Validation middleware wrote to `req.query`, which is read-only in Express 5, so defaults and coerced values would be lost | Code review | Parsed data goes to `req.validated` |
| Login email was not lowercased like registration, so mixed-case login would fail | Code review | Same normalisation in both schemas |
| Mixed Zod 3 and Zod 4 APIs, so missing-field messages would not show | Code review | Zod 4 `error` option throughout |
| Malformed JSON returned 500; unknown errors were not logged | Code review | 422 for bad JSON, `console.error` for unknown errors |
| Login for an unknown email returned faster than for a wrong password (timing leak) | Code review | Dummy hash comparison |
| Pagination sorted on `createdAt` only, so ties could repeat or skip rows across pages | Code review | Added `_id` as a tie-breaker |
| Seed script left users behind if the shipment insert failed, and set `createdAt` to "now" instead of matching the history | Code review | Cleanup on failure and explicit timestamps |
| Rate-limit test passed even with a wrong limit, because earlier tests had used part of the budget | Test review | Own test file with exact assertions |

### What I would do differently
[Write 2 or 3 honest sentences. Examples: "I would have asked Kiro to read the
requirements I edited before generating the design", "I would write the seed script by
hand", "I would test the UI earlier; the missing `allowed` variable was only caught when I
ran the app."]

- **Spec-driven workflow:** requirements -> design -> tasks were generated in Kiro, then reviewed and edited by me before any code was generated (see `.kiro/specs/`).
- **What Kiro generated:** TODO (e.g. validation middleware, auth middleware and service, routes and controllers, shipment service functions, test suites, seed script, client API layer, pages).
- **What I wrote or edited by hand:** TODO (e.g. config files, project move into `src/`, model limits, the fixes listed below).
- **Other tools:** TODO (state any other assistant you used for review or debugging).

### Problems found in generated output and how they were fixed

For each item, say how you found it and link the fixing commit.

1. **Spec: rate limit applied to all `/api/auth` routes**, which would throttle `/me` on every page load. Narrowed to login and register.
2. **Spec: 403 for any disallowed status change**, which leaked that another user's shipment exists. Split into 404 (not yours) and 403 (yours, but not allowed).
3. **Spec: CORS "returns 403" and exact Helmet header values**, neither of which those libraries actually do. Reworded to match real behaviour.
4. **Validation middleware assigned to `req.query`**, which is read-only in Express 5, so coerced values and defaults would be lost. Parsed data now goes to `req.validated`.
5. **Auth schemas:** login email was not lowercased like registration (case-sensitive login bug); Zod 3 and Zod 4 APIs were mixed; password minimum counted bytes instead of characters.
6. **Error handler:** malformed JSON returned 500 and unknown errors were not logged.
7. **Login timing:** unknown emails returned faster than wrong passwords (user enumeration by timing). Added a dummy hash comparison.
8. **Pagination order** had no tie-breaker, so equal `createdAt` values could repeat or skip items across pages. Added `_id` to the sort.
9. **Seed script:** a failed shipment insert left users behind (violating the spec), and `createdAt` was "now" instead of matching the history. Added cleanup and explicit timestamps.
10. **Tests:** the rate-limit test passed even if the limit was wrong (earlier tests had used part of the budget). Moved to its own file with exact assertions.

## Scripts

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` | Start API with nodemon |
| server | `npm start` | Start API |
| server | `npm test` | Run all tests |
| server | `npm run seed` | Reset and seed demo data |
| client | `npm run dev` | Start Vite dev server |
| client | `npm run build` | Production build |
