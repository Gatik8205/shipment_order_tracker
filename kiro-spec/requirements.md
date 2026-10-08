# Requirements: Shipment Tracker

## Introduction
A small MERN app for creating shipments and tracking them through a validated status lifecycle,
with an audit history of every change. Two roles: `user` and `admin`.

## Requirement 1: Authentication
**User story:** As a visitor, I want to register and log in so that my shipments are private to me.

Acceptance criteria
1. WHEN a visitor submits a unique email, name and password (min 8 chars) THEN the system SHALL create a `user` account and return a JWT.
2. WHEN credentials are valid THEN the system SHALL return a JWT that expires in 1 day.
3. IF credentials are invalid THEN the system SHALL return 401 without revealing which field was wrong.
4. WHEN a protected route is called without a valid JWT THEN the system SHALL return 401.
5. The system SHALL store only bcrypt-hashed passwords and SHALL never return the hash in any response.

## Requirement 2: Shipment CRUD
**User story:** As a user, I want to create and manage my shipments.

Acceptance criteria
1. WHEN a user creates a shipment with title, origin, destination and recipient THEN the system SHALL generate a unique `trackingId`, set status `CREATED`, and write the first history entry.
2. WHEN a `user` lists shipments THEN the system SHALL return only their own; WHEN an `admin` lists THEN the system SHALL return all.
3. WHEN a `user` requests another user's shipment THEN the system SHALL return 404 (not 403, to avoid leaking existence).
4. The list endpoint SHALL support `?status=`, `?page=` and `?limit=`.
5. WHEN a user edits a shipment THEN the system SHALL allow changes only to title, origin, destination, recipient, and only while status is `CREATED`.

## Requirement 3: Status lifecycle
**User story:** As an admin, I want to move shipments through valid states so tracking data is trustworthy.

Allowed transitions
- CREATED -> PICKED_UP | CANCELLED
- PICKED_UP -> IN_TRANSIT | CANCELLED
- IN_TRANSIT -> DELIVERED
- DELIVERED and CANCELLED are terminal.

Acceptance criteria
1. WHEN an `admin` requests a valid transition THEN the system SHALL update the status and append a history entry (from, to, actor, timestamp, optional note) in one atomic operation.
2. IF the transition is not allowed THEN the system SHALL return 409 with the allowed next states.
3. IF a `user` requests any status change other than cancelling their own `CREATED` shipment THEN the system SHALL return 403.
4. IF two requests race on the same shipment THEN exactly one SHALL succeed and the other SHALL return 409.

## Requirement 4: History / timeline
Acceptance criteria
1. WHEN a shipment is fetched THEN the system SHALL return its history ordered oldest to newest.
2. History entries SHALL be immutable: no endpoint edits or deletes them.

## Requirement 5: Frontend
Acceptance criteria
1. The app SHALL provide login/register, a dashboard list with status filter and pagination, a create form, and a detail page with a vertical timeline.
2. WHEN a request is in flight THEN the UI SHALL show a loading state; WHEN it fails THEN the UI SHALL show the server's error message.
3. Admin-only controls (advance status) SHALL be hidden from `user` accounts, and the server SHALL still enforce this independently.

## Out of scope
Maps, notifications, payments, file uploads, real-time updates.
