# Requirements Document

## Introduction

Shipment Order Tracker is a MERN-stack web application that lets users create shipments
and follow them through a validated status lifecycle. Every status change is recorded in
an immutable, append-only history log. Two roles exist: `user` (creates and monitors their
own shipments) and `admin` (advances all shipments through the lifecycle). The application
exposes a REST API consumed by a React SPA.

## Glossary

- **System**: The Shipment Order Tracker application (backend + frontend combined).
- **API**: The Express.js REST backend.
- **UI**: The React (Vite) single-page application frontend.
- **User**: A registered account with role `user`.
- **Admin**: A registered account with role `admin`.
- **Actor**: The authenticated account performing an action (either a User or an Admin).
- **Shipment**: A domain object representing a parcel being tracked, owned by the User who created it.
- **TrackingId**: A system-generated, globally unique alphanumeric identifier for a Shipment.
- **Status**: The current lifecycle state of a Shipment. One of: `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.
- **TerminalStatus**: A Status from which no further transitions are possible (`DELIVERED` or `CANCELLED`).
- **HistoryEntry**: An immutable record of a single Status transition: `{ from, to, actor, note, at }`.
- **JWT**: A JSON Web Token used to authenticate API requests.
- **TransitionMap**: The single authoritative definition of allowed Status transitions, defined in `utils/transitions.js`.
- **Validator**: The Zod-based request-validation middleware.
- **AuthMiddleware**: Middleware that verifies the JWT and attaches the Actor to the request.
- **ErrorHandler**: The centralized Express error-handling middleware.
- **Seed_Script**: A standalone Node.js script that populates the database with representative data.

## Conventions

- All request-validation failures return HTTP 422 with field-level errors. No endpoint uses 400 for validation.
- A resource the Actor is not allowed to see is reported as HTTP 404, never 403, so that its existence is not revealed. HTTP 403 is used only when the resource is visible to the Actor but the specific action is forbidden.

---

## Requirements

### Requirement 1: User Registration

**User Story:** As a visitor, I want to register with my name, email, and password, so that I have a private account to manage my shipments.

#### Acceptance Criteria

1. WHEN a visitor submits a unique email in valid format, a name between 1 and 80 characters, and a password between 8 and 72 bytes (UTF-8, bcrypt's input limit), THE API SHALL create an account with role `user`, store only the bcrypt hash of the password, and return a JWT that expires in 24 hours.
2. IF the submitted email is already registered (compared case-insensitively), THEN THE API SHALL return HTTP 409 with the message "Email already registered". Registration necessarily reveals that an email is taken; this user-enumeration trade-off is accepted and documented in the README. Login (Requirement 2) remains generic.
3. IF any required registration field is missing or fails validation, THEN THE API SHALL return HTTP 422 with a structured list of field-level errors produced by the Validator, where each error identifies the field name and a human-readable reason.
4. THE API SHALL never return the password hash in any response, including registration, login, or profile responses.

---

### Requirement 2: User Login

**User Story:** As a registered account holder, I want to log in with my email and password, so that I can access my shipments securely.

#### Acceptance Criteria

1. WHEN a visitor submits a valid email and matching password, THE API SHALL return HTTP 200 with a JWT that expires in 24 hours and the account's `id`, `name`, `email`, and `role`.
2. IF the email is not found or the password does not match, THEN THE API SHALL return HTTP 401 with a single generic error message that does not indicate which field was incorrect.
3. WHEN more than 20 requests to `POST /api/auth/login` or `POST /api/auth/register` originate from the same IP address within a 15-minute window, THE API SHALL return HTTP 429 and SHALL NOT process further requests to those endpoints from that IP until the window expires (see Requirement 17.3).
4. IF the login request body is missing `email` or `password`, THEN THE API SHALL return HTTP 422 with field-level validation errors before attempting any credential lookup.

---

### Requirement 3: Authenticated Identity

**User Story:** As an authenticated account holder, I want to retrieve my current profile, so that the UI can display my name and role without re-parsing the JWT client-side.

#### Acceptance Criteria

1. WHEN an authenticated request is made to `GET /api/auth/me`, THE API SHALL return HTTP 200 with the Actor's `id`, `name`, `email`, and `role`.
2. WHEN a request to any protected route is made without a valid JWT, THE API SHALL return HTTP 401.
3. WHEN a request carries an expired or malformed JWT, THE API SHALL return HTTP 401 with an error message indicating the token is invalid or expired, and the response body SHALL NOT include the token string, its signature, or any decoded token payload fields.
4. IF a request carries a valid JWT whose subject no longer exists in the database, THEN THE API SHALL return HTTP 401.

---

### Requirement 4: Shipment Creation

**User Story:** As a User, I want to create a shipment with title, origin, destination, and recipient, so that I can start tracking a parcel.

#### Acceptance Criteria

1. WHEN an authenticated Actor submits a `title` (max 120 characters), `origin` (max 200 characters), `destination` (max 200 characters), and `recipient` (max 120 characters), THE API SHALL generate a unique TrackingId, set the Status to `CREATED`, record `createdBy` as the Actor's id, append the first HistoryEntry `{ from: null, to: "CREATED", actor: Actor.id, at: now }`, and return HTTP 201 with the created Shipment.
2. IF any required shipment field is missing, empty, or exceeds its maximum length, THEN THE API SHALL return HTTP 422 with a structured list of field-level validation errors identifying the field name and reason.
3. THE API SHALL rely on the unique index on `trackingId` to detect collisions. WHEN persisting a Shipment fails with a duplicate-key error on `trackingId`, THE API SHALL generate a new TrackingId and retry, up to 5 attempts in total; IF all 5 attempts fail, THEN THE API SHALL return HTTP 500 and SHALL NOT persist a partial document. THE API SHALL NOT use a check-then-insert pattern, because it is subject to a race.

---

### Requirement 5: Shipment Listing

**User Story:** As a User or Admin, I want to list shipments with optional filtering and pagination, so that I can find the shipments I care about efficiently.

#### Acceptance Criteria

1. WHEN a User requests `GET /api/shipments`, THE API SHALL return only Shipments where `createdBy` equals the Actor's id.
2. WHEN an Admin requests `GET /api/shipments`, THE API SHALL return all Shipments regardless of owner.
3. WHEN a `?status=` query parameter is provided with a valid Status value, THE API SHALL filter results to Shipments whose Status exactly matches the given value; IF the value is not a recognised Status, THE API SHALL return HTTP 422.
4. WHERE `?page=` and `?limit=` query parameters are provided as positive integers, THE API SHALL return the corresponding page of results with a response body containing `data` (array), `total` (count of all matching documents), `page` (current page number), and `limit` (page size used); IF either value is not a positive integer, THE API SHALL return HTTP 422.
5. IF `?page=` or `?limit=` are not provided, THE API SHALL default to page 1 and a limit of 20; the `limit` parameter SHALL be capped at 100.
6. THE API SHALL return results ordered by `createdAt` descending.

---

### Requirement 6: Shipment Detail

**User Story:** As a User or Admin, I want to retrieve the full detail of a single Shipment including its history, so that I can see exactly what has happened to it.

#### Acceptance Criteria

1. WHEN an Admin requests `GET /api/shipments/:id` for an existing Shipment, THE API SHALL return HTTP 200 with all Shipment fields and the full HistoryEntry array ordered by `at` ascending, where each entry contains `from`, `to`, `note`, `at`, and `actor` as an object `{ id, name }`.
2. WHEN a User requests `GET /api/shipments/:id` for an existing Shipment owned by that User, THE API SHALL return HTTP 200 with all Shipment fields and the full HistoryEntry array in the same shape and order as criterion 1.
3. IF a User requests `GET /api/shipments/:id` for a Shipment not owned by that User, THEN THE API SHALL return HTTP 404.
4. IF the requested `:id` does not correspond to any Shipment in the database, or is not a valid ObjectId, THEN THE API SHALL return HTTP 404.

---

### Requirement 7: Shipment Editing

**User Story:** As a User, I want to edit the title, origin, destination, and recipient of my shipment while it is still in `CREATED` status, so that I can correct mistakes before it is picked up.

#### Acceptance Criteria

1. WHEN a User submits a `PATCH /api/shipments/:id` request for a Shipment owned by that User whose Status is `CREATED`, THE API SHALL apply changes only to the fields `title` (max 120 chars), `origin` (max 200 chars), `destination` (max 200 chars), and `recipient` (max 120 chars); each provided value must be a non-empty string; THE API SHALL return HTTP 200 with the updated Shipment.
2. IF the target Shipment has a Status other than `CREATED`, THEN THE API SHALL return HTTP 409 with a message indicating the Shipment can no longer be edited.
3. IF any Actor other than the owner (including an Admin) attempts to edit a Shipment, THEN THE API SHALL return HTTP 404. Only the owner may edit.
4. IF an Actor submits a PATCH body containing no permitted fields, or all permitted-field values are empty strings, or any value exceeds its maximum length, THEN THE API SHALL return HTTP 422.
5. IF the requested `:id` does not correspond to any Shipment, or is not a valid ObjectId, THEN THE API SHALL return HTTP 404.

---

### Requirement 8: Status Lifecycle Transitions

**User Story:** As an Admin, I want to advance a Shipment through valid lifecycle states, so that the tracking data is accurate and trustworthy.

#### Acceptance Criteria

1. WHEN an Admin submits `POST /api/shipments/:id/status` with a `to` value that is a valid next state per the TransitionMap, THE API SHALL update the Shipment's Status to `to`, append a HistoryEntry `{ from: currentStatus, to, actor: Admin.id, note, at: now }` atomically, and return HTTP 200 with the updated Shipment. The optional `note` is a string of at most 280 characters.
2. WHEN a User submits `POST /api/shipments/:id/status` with `to: "CANCELLED"` for a Shipment owned by that User whose current Status is `CREATED`, THE API SHALL apply the transition atomically as described in criterion 1 and return HTTP 200 with the updated Shipment.
3. IF a User submits `POST /api/shipments/:id/status` for a Shipment not owned by that User, THEN THE API SHALL return HTTP 404.
4. IF a User submits `POST /api/shipments/:id/status` for a Shipment owned by that User in any combination not covered by criterion 2, THEN THE API SHALL return HTTP 403.
5. IF the `to` value is missing or is not a recognised Status, or `note` exceeds 280 characters, THEN THE API SHALL return HTTP 422.
6. IF the requested `to` value is a recognised Status but is not an allowed next state for the Shipment's current Status according to the TransitionMap, THEN THE API SHALL return HTTP 409 with a response body containing the list of allowed next states.
7. IF two concurrent requests attempt to transition the same Shipment and only one can match the current Status atomically, THEN THE API SHALL return HTTP 409 for the request that did not match, with a response body containing a conflict message and the list of allowed next states.
8. THE API SHALL evaluate transition validity solely by consulting the TransitionMap; the set of allowed transitions visible at the API boundary SHALL match the TransitionMap exactly.
9. IF the requested `:id` does not correspond to any Shipment, or is not a valid ObjectId, THEN THE API SHALL return HTTP 404.

---

### Requirement 9: Transition Rules (TransitionMap)

**User Story:** As a developer, I want a single authoritative source of transition rules, so that lifecycle logic is not duplicated across the codebase.

#### Acceptance Criteria

1. THE TransitionMap SHALL define the following allowed transitions and no others: `CREATED` → `PICKED_UP`, `CANCELLED`; `PICKED_UP` → `IN_TRANSIT`, `CANCELLED`; `IN_TRANSIT` → `DELIVERED`; `DELIVERED` → (terminal, no exits); `CANCELLED` → (terminal, no exits).
2. WHEN `canTransition(from, to)` is called with a valid transition pair, THE TransitionMap SHALL return `true`.
3. WHEN `canTransition(from, to)` is called with a pair where `to` is not in `allowedNext(from)` — including skipped, reversed, or unknown values — THE TransitionMap SHALL return `false`.
4. WHEN `allowedNext(status)` is called with a TerminalStatus (`DELIVERED` or `CANCELLED`), THE TransitionMap SHALL return an empty array.
5. WHEN `allowedNext(status)` is called with an unknown or non-string value, THE TransitionMap SHALL return an empty array without throwing.
6. WHEN `allowedNext(status)` is called with a non-terminal known status, THE TransitionMap SHALL return a non-empty array containing exactly the states listed in criterion 1 for that status.

---

### Requirement 10: Immutable History

**User Story:** As an Admin, I want shipment history to be append-only, so that the audit trail is trustworthy and tamper-proof.

#### Acceptance Criteria

1. WHEN `GET /api/shipments/:id` is called, THE API SHALL return the complete HistoryEntry array for that Shipment without omission, ordered by `at` ascending.
2. THE API SHALL expose no endpoint that writes to, replaces, or removes an existing HistoryEntry.
3. WHEN a Shipment is updated by any endpoint, THE API SHALL not remove or alter any pre-existing HistoryEntry; new entries may only be added.

---

### Requirement 11: Frontend Authentication Pages

**User Story:** As a visitor, I want Login and Register pages, so that I can create an account and access the application.

#### Acceptance Criteria

1. WHEN a visitor submits valid credentials on the Login page, THE UI SHALL store the JWT and the user profile in the AuthContext and redirect to the Dashboard.
2. WHEN a visitor submits the Registration form with valid name, email, and password, THE UI SHALL store the JWT and user profile in the AuthContext and redirect to the Dashboard.
3. IF the API returns an error on login or registration, THEN THE UI SHALL display the server's error message and clear the password field.
4. WHILE a login or registration request is in flight, THE UI SHALL show a loading indicator and disable the submit button.
5. WHEN an unauthenticated visitor navigates to a protected route, THE UI SHALL redirect to the Login page and preserve the originally requested route so it can be restored after successful authentication.
6. IF the visitor submits the Login form with an empty email or password, THEN THE UI SHALL display a validation error indicating which field is missing and SHALL NOT submit the request.
7. IF the visitor submits the Registration form with a password shorter than 8 characters or an email that does not match a valid format, THEN THE UI SHALL display a validation error and SHALL NOT submit the request.

---

### Requirement 12: Dashboard and Shipment List

**User Story:** As an authenticated user, I want a Dashboard that lists my shipments with status filtering and pagination, so that I can quickly find any shipment.

#### Acceptance Criteria

1. WHEN an authenticated Actor navigates to the Dashboard, THE UI SHALL fetch and display the Actor's accessible Shipments ordered by creation date descending, defaulting to page 1 with a limit of 20.
2. WHEN a status filter is selected, THE UI SHALL pass `?status=` to the API, reset to page 1, and re-render the list.
3. WHEN a pagination control is activated, THE UI SHALL pass the new `?page=` and `?limit=` values to the API and display the returned page.
4. WHILE a list request is in flight, THE UI SHALL show a visible loading indicator and SHALL NOT allow further filter or pagination interaction until the request completes.
5. IF the API returns an error, THEN THE UI SHALL display the server's error message in place of the list.
6. WHEN the API returns an empty `data` array with no active status filter, THE UI SHALL display a message indicating the Actor has no shipments yet.
7. WHEN the API returns an empty `data` array with an active status filter, THE UI SHALL display a message indicating no shipments match the selected status.

---

### Requirement 13: Shipment Detail and Timeline

**User Story:** As an authenticated user, I want a Shipment Detail page with a vertical status timeline, so that I can see the full history of a parcel at a glance.

#### Acceptance Criteria

1. WHEN an authenticated Actor navigates to Shipment Detail, THE UI SHALL fetch the Shipment and render a vertical timeline showing each HistoryEntry in chronological order with status label, formatted timestamp, actor name (from the `actor.name` field returned by the API), and note (if present).
2. IF an Admin is viewing a Shipment that is not in a TerminalStatus, THEN THE UI SHALL display one control per allowed next state, each labelled with that state's name.
3. IF a User is viewing a Shipment owned by that User and its Status is `CREATED`, THEN THE UI SHALL display a Cancel button.
4. WHILE a status change request is in flight, THE UI SHALL disable all status controls and show a loading indicator.
5. IF the API returns an error on a status change, THEN THE UI SHALL display the server's error message inline without navigating away.
6. WHEN a status change request completes successfully, THE UI SHALL re-fetch the Shipment and update the timeline and status controls to reflect the new state.
7. IF the initial Shipment fetch fails, THEN THE UI SHALL display an error message and SHALL NOT render the timeline or status controls.

---

### Requirement 14: New Shipment Form

**User Story:** As a User, I want a form to create a new shipment, so that I can start tracking a parcel without leaving the application.

#### Acceptance Criteria

1. WHEN an authenticated Actor submits the New Shipment form with a non-empty title, origin, destination, and recipient within their respective length limits, THE UI SHALL call the API and redirect to the newly created Shipment's Detail page on success.
2. IF the API returns validation errors, THEN THE UI SHALL display field-level error messages adjacent to the relevant inputs without navigating away.
3. WHILE the creation request is in flight, THE UI SHALL show a loading state and disable the submit button.
4. IF the Actor submits the form with any required field empty, THEN THE UI SHALL display a client-side validation error for each empty field and SHALL NOT submit the request.

---

### Requirement 15: Centralized API Client

**User Story:** As a developer, I want a centralized Axios client, so that authentication headers and 401 handling are managed in one place rather than in every component.

#### Acceptance Criteria

1. THE UI SHALL attach the `Authorization: Bearer <token>` header to every outgoing API request to authenticated endpoints using a single Axios request interceptor; unauthenticated endpoints (register, login) SHALL NOT have this header attached.
2. WHEN the API responds with HTTP 401 to a request made with a token, THE UI SHALL clear the AuthContext, remove the stored JWT from localStorage, and redirect the Actor to the Login page; a 401 response from the login endpoint itself SHALL NOT trigger this redirect.
3. THE UI SHALL expose named API functions (e.g. `createShipment`, `listShipments`) for all endpoints; pages and components SHALL call these functions rather than using Axios directly.
4. THE UI stores the JWT in localStorage. This is a known trade-off (readable by injected scripts if an XSS flaw exists) that is accepted for this project and documented in the README.

---

### Requirement 16: Seed Script

**User Story:** As a developer, I want a seed script, so that I can populate the database with representative data for manual testing and demonstration.

#### Acceptance Criteria

1. WHEN the Seed_Script is executed, THE System SHALL create exactly 1 Admin account, 2 User accounts, and exactly 12 Shipments distributed so that each of the 5 statuses has at least 1 Shipment, with each Shipment's history containing one HistoryEntry per status transition traversed to reach its seeded status.
2. IF `NODE_ENV` is `"production"`, THEN THE Seed_Script SHALL refuse to run, print an explanatory message, and exit with a non-zero code without touching the database.
3. WHEN the Seed_Script is executed against a database that already contains data, THE System SHALL delete all documents in the `users` and `shipments` collections before inserting fresh seed data.
4. THE Seed_Script SHALL build and validate all documents in memory first, then insert them with a single `insertMany` per collection, without relying on multi-document transactions (which are unavailable on a standalone MongoDB).
5. IF the Seed_Script encounters an error during validation or insertion, THEN THE System SHALL halt, print an error message to stdout, and exit with a non-zero code; no documents from a failed insert SHALL remain.
6. WHEN the Seed_Script completes successfully, THE System SHALL print the name, email, plaintext password, and role of every created account to stdout.

---

### Requirement 17: Security Baseline

**User Story:** As an operator, I want the API to apply security best practices by default, so that common web vulnerabilities are mitigated without additional configuration.

#### Acceptance Criteria

1. THE API SHALL apply `helmet` middleware with its default configuration to every response, so that its standard secure headers (including `X-Content-Type-Options: nosniff` and `Strict-Transport-Security`) are set. The exact header values are those of the installed helmet version.
2. THE API SHALL apply `cors` middleware configured to allow cross-origin requests only from the client origin given in the server's environment configuration; requests from other origins SHALL NOT receive CORS allow headers.
3. THE API SHALL apply `express-rate-limit` to `POST /api/auth/login` and `POST /api/auth/register` at a threshold of 20 requests per 15-minute window per IP; requests exceeding this threshold SHALL receive HTTP 429. `GET /api/auth/me` SHALL NOT be rate limited by this rule.
4. WHEN a password is hashed, THE API SHALL use `bcryptjs` with a cost factor of 10.
5. THE API SHALL use parameterized Mongoose queries and SHALL NOT construct raw query strings from user-supplied input.
6. WHEN `NODE_ENV` is not `"production"`, THE ErrorHandler SHALL include the error stack trace in the response body; WHEN `NODE_ENV` is `"production"`, THE ErrorHandler SHALL omit the stack trace from the response body.