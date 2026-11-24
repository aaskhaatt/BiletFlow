# BiletFlow

BiletFlow is a self-service event-ticketing platform for Kazakhstan, built as a 5-person academic project over 10–12 weeks. Organizers create events and issue free or paid QR-code tickets. Attendees register or buy tickets, and event admins check people in with a mobile app. This repository holds the **backend API**. The web frontend (React + Vite) and the mobile app (React Native) call it. The team changed the requirement: the mobile app does what the website does, plus ticket scanning. This overrides the SRS, which excludes native attendee and organizer apps.

Source of truth for requirements: the SRS, "BiletFlow_SRS_Initial_Draft.pdf" (v0.3). Section 8 sets the MVP scope; Section 13 has the schedule and team ownership.

Two backend developers work on this repo from different computers. **Dev B starts with `docs/onboarding-dev-b.md`**: setup on Windows, file ownership, git and migration rules, the interfaces between the two developers, and Dev B's task specs.

## Stack

- Python 3.12, FastAPI, Pydantic v2
- SQLAlchemy 2.0 (sync, `Mapped[...]` style), Alembic migrations
- PostgreSQL 16 (via `psycopg2`)
- Auth: bcrypt password hashing, JWT access tokens (`python-jose`), opaque refresh tokens stored in the DB
- Docker Compose for local and demo deployment

## Running locally

All Python commands run from `backend/`. Imports are absolute from that folder (`from database import ...`).

```bash
docker compose up -d postgres            # from repo root: start only the database
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head                     # apply migrations
uvicorn main:app --reload                # API on http://localhost:8000, docs at /docs
```

Full stack in Docker: `docker compose up --build` (from the repo root).

### Tests

```bash
python tests/run_all.py            # from backend/, venv active, Postgres running
python tests/run_all.py orders     # only test files whose name contains "orders"
```

These are end-to-end tests in `backend/tests/e2e/`, one `test_<feature>.py` per feature, using only the standard library. Each starts its own API server on port 8011 (override with `E2E_PORT`), calls it over HTTP, and deletes every user and event it created. They run against the database in `backend/.env`. Server errors during a run go to `tests/e2e/server.log`. **Every new feature adds a test file, and all tests must pass before committing.**

### Environment variables (`backend/.env`, not committed)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL, e.g. `postgresql://postgres:postgres@localhost:5432/biletflow`. Inside Docker the host is `postgres`, not `localhost`. |
| `SECRET_KEY` | JWT signing key |
| `ALGORITHM` | JWT algorithm, e.g. `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime |

The app crashes at startup if any of these is missing.

Email (optional): `SMTP_HOST` turns the email sender on (unset = emails stay `pending`); `SMTP_PORT` (1025, Mailpit), `MAIL_FROM` (`BiletFlow <no-reply@biletflow.local>`), `FRONTEND_URL` (`http://localhost:5173`, used for links in emails), `EMAIL_SEND_INTERVAL_SECONDS` (5).

Optional, with defaults: `ORDER_HOLD_MINUTES` (10) is how long a paid checkout holds its tickets. `ORDER_SWEEP_INTERVAL_SECONDS` (60) is how often the background sweeper releases expired holds; tests set it to 1.

## Project structure

```
backend/
  main.py               app setup: routers, exception handlers, CORS
  database.py           engine, SessionLocal, Base, get_db dependency
  dependencies.py       get_current_user, require_platform_admin
  security.py           password hashing, JWT, refresh token and ticket code generation
  qr.py                 QR code PNG generation (reused by PDF tickets later)
  background.py         sweeper that releases expired checkout holds; started by the lifespan in main.py
  exceptions.py         domain exceptions (plain Exception subclasses)
  exception_handlers.py maps domain exceptions to HTTP status + JSON error body
  models/               SQLAlchemy models (must be imported in models/__init__.py)
  schemas/              Pydantic request/response models
  repositories/         database access only
  services/             business rules, permission checks
  routers/              HTTP endpoints, thin: parse input, call service
  alembic/versions/     migrations
  tests/run_all.py      runs every end-to-end test
  tests/e2e/            helpers.py (shared test tools) + one test_<feature>.py per feature
```

## Conventions

**Layers.** Router → service → repository → model. Routers contain no logic, only a service call. Services hold business rules and ownership checks. Repositories only talk to the database.

**Errors.**
- Raise a domain exception from `exceptions.py`. Don't raise `HTTPException` in services or repositories.
- Register every new exception in the `ERRORS` dict in `exception_handlers.py` with `(status_code, message)`, or it becomes a 500.
- Error response body: `{"error": "<ExceptionName>", "message": "...", "fields": null}`.
- Validation errors return 422 with `{"error": "VALIDATION_ERROR", "message": "Invalid data", "fields": {field: msg}}`.
- `get_*_by_id`-style repository functions raise `<Entity>NotFoundError` instead of returning `None`.

**Authorization.**
- Use `Depends(get_current_user)` for signed-in users and `Depends(require_platform_admin)` for admins.
- Organizer actions start with `ensure_organizer_approved_service(user_id, db)`. Then compare `organizer.id` with the resource's `organizer_id` and raise `EventAccessDeniedError` on mismatch. New code uses `ensure_event_owner_service(user_id, event_id, db)` from `event_service.py`, which does both and returns the event.
- Scanning endpoints use `ensure_can_scan_service` (assigned staff or the event's organizer, otherwise 403).

**Data.**
- Money is an **integer number of KZT** (no floats, no decimals).
- All datetimes are timezone-aware: `DateTime(timezone=True)`, created with `datetime.now(timezone.utc)`.
- Statuses are plain strings. Event: `draft` / `published` / `cancelled`. Organizer profile: `pending` / `approved`. Order: `pending` (F5) / `confirmed` / `cancelled` / `refunded` / `expired` (F5). Ticket: `valid` / `checked_in` / `cancelled` / `refunded`.
- **Inventory** changes only through the atomic reserve queries (`reserve_ticket_type_inventory`, `reserve_event_capacity`): one `UPDATE ... WHERE sold + n <= limit RETURNING`. Never check availability in Python and then write, because that double-sells under concurrency.
- Orders copy `unit_price`, `buyer_name` and `buyer_email` at purchase time (snapshots), so later edits never rewrite history.
- **Concurrency patterns.**
  1. When check and change fit in one statement: an atomic `UPDATE ... WHERE <condition> RETURNING` (inventory, check-in, refresh tokens, promo code uses).
  2. When something must happen in between (charging a payment): lock the row with `SELECT ... FOR UPDATE` **plus `.execution_options(populate_existing=True)`**. Without it, SQLAlchemy may return a stale cached copy after waiting for the lock.
  3. To create-if-missing: `INSERT ... ON CONFLICT DO NOTHING`.
  4. Unique constraints are the final guarantee; catch `IntegrityError` for a friendly 409.
  5. **Lock order rule.** A transaction that locks or updates several of these rows does it in this order: **event → its orders → ticket types → promo campaigns**.
     - `lock_event` comes first, inventory release does the event before ticket types, and reservations do the event capacity before ticket types.
     - Locking in different orders in different code paths causes deadlocks under concurrency.
     - That's why `pay_order_service` only refuses an overdue order and leaves the release to the sweeper.

**OpenAPI operation IDs** are generated as `{first tag}-{function name}` (see `main.py`). The frontend generates its API client from these, so **renaming an endpoint function or tag is a breaking change** for the frontend.

**Migrations.**
- After changing a model, run `alembic revision --autogenerate -m "describe change"` and **read the generated file before applying it**.
- Never edit a migration that has already been applied or pushed; add a new one.

**Transactions.**
- Repositories only `add` or change objects, then `db.flush()`. **They never commit.** `flush()` sends the SQL (so new rows get their `id`), but it can still be rolled back.
- The service commits **once**, after all the steps of an action (the change plus its audit log): `db.commit()`, then `db.refresh(obj)`, then `return obj`.
- A service that forgets to commit loses its changes silently. `get_db` rolls back anything uncommitted when the request ends, while the response still looks successful.

**Audit log.**
- Every state-changing organizer or admin action calls `log_action(db, actor_user_id, action, entity_type, entity_id, description, event_id=...)` from `services/audit_service.py`, **before** the commit.
- `action` is `<entity>.<past-tense verb>` (`event.published`, `ticket_type.updated`, later `order.refunded`).
- For updates, collect "old -> new" for important fields (price, capacity) **before** calling the repository, then put them in the description.
- Audit rows are never updated or deleted by the app.

**Emails.**
- Any action that should email someone calls `queue_email(db, to, template, data)` from `services/email_service.py`, **before** the commit, exactly like `log_action`.
- It only saves a row in `email_outbox` (status `pending`) in the same transaction, so a rolled-back action never emails anyone. The background sender (`send_due_emails`, started by `main.py` only when `SMTP_HOST` is set) sends them every few seconds, oldest first, and retries failures with backoff (1, 2, 4, 8 min; `failed` after 5 attempts). Subjects and bodies live in `services/email_templates.py`.
- `template` must be a key of `EMAIL_TEMPLATES`, which also lists the `data` keys each template uses. Agree on a new name with the other developer before adding one.
- `data` must be JSON-safe: pass ids, strings and numbers, and datetimes as `.isoformat()` strings. An unknown template or non-JSON data raises at once (a programming error, not a domain exception).
- Local demo: `docker compose up -d mailpit`, put `SMTP_HOST=localhost` in `backend/.env`, and every email shows up at http://localhost:8025. The e2e test servers always run with the sender off.
- Pass the address from the order snapshot (`order.buyer_email`), not from the current user, so history stays correct.

## Status (update as features land)

Done:
- Project setup, Docker, Alembic
- Registration and login (JWT)
- Organizer apply and admin approve
- Events: create, update, publish, unpublish, cancel, list published, list mine, public `GET /events/{id}`. Venue, category, capacity, visibility (public/unlisted/private) and a registration window. Publishing needs a venue; drafts and private events return 404 publicly.
- Ticket types: create, list, update, hide and unhide, `max_per_order` (default 10)
- Unified error format, CORS for `http://localhost:5173`
- Refresh tokens: stored as SHA-256 hashes, rotated on every refresh with an atomic `DELETE ... RETURNING`; logout always succeeds
- Audit log (`audit_logs` table): event and ticket-type actions are logged in the same transaction as the change. There's no read endpoint yet; the timeline API is Feature 12.
- Orders + free registration: `POST /events/{id}/orders`, `GET /orders/me`, `GET /orders/{id}`, `GET /events/{id}/attendees`. Tickets have random `T-` codes. Concurrency-tested: 20 simultaneous buyers for 5 tickets give exactly 5 tickets.
- Ticket QR image: `GET /tickets/{id}/qr` returns a PNG for the ticket's owner (`qr.py`, using `qrcode` + `pypng`, error correction "Q" for paper tickets)
- Staff + check-in (Feature 3):
  - Staff management: `POST/GET /events/{id}/staff`, `DELETE /events/{id}/staff/{user_id}`, `GET /staff/events`.
  - Scanning: `POST /events/{id}/check-in` always returns 200 with a `result` (`checked_in`, `already_checked_in`, `invalid`, `wrong_event`, `cancelled`, `refunded`, `event_cancelled`).
  - Also `POST .../check-in/undo`, `GET .../check-in/search?q=` and `GET .../check-in/stats`.
  - Rules: only `T-` codes can admit anyone; check-in and undo are atomic `UPDATE ... WHERE status = ...`; every scan and undo is stored in `check_in_records` and the audit log.
  - Assigned staff and the event's organizer may scan.
- Paid sales activation (Feature 4, simulated):
  - Checklist: `GET /events/{id}/paid-sales`, `POST .../accept-terms`, `POST .../pay-fee` (`simulate_outcome: success|failure`), `POST .../activate`.
  - Organizer-level steps: `GET /organizers/me`, `POST /organizers/me/verification`, `PUT /organizers/me/payout-account`. Only the IBAN's last 4 characters are stored.
  - Admin: `GET /admin/paid-sales`, `POST /admin/events/{id}/paid-sales/suspend|reinstate`, `GET /admin/settings`, `PUT /admin/settings/activation-fee`.
  - Paid ticket types can't be ordered unless the event's activation is `active`.
- Paid checkout (Feature 5):
  - `POST /events/{id}/orders` with any paid item creates a `pending` order that holds its tickets until `expires_at` (now + 10 min). It has **no tickets** yet.
  - `POST /orders/{id}/pay` (`simulate_outcome`) locks the order. A decline (402) keeps it pending for retry; success confirms it and issues the tickets.
  - Expired holds are released (inventory decremented, status `expired`) by an atomic claim, both before every new order for that event and by the background sweeper.
  - A 3% processing fee is stored per order and deducted from the organizer payout.
  - `GET /events/{id}/sales` gives gross, fees, refunds, estimated payout, and per-ticket-type sold, reserved and available counts.
  - `sold_count` on ticket types counts sold **plus** held tickets.
- Cancellations + refunds (Feature 6, `services/cancellation_service.py`):
  - `POST /orders/{id}/cancel`: the buyer or the organizer cancels a pending checkout or a free registration.
  - `POST /orders/{id}/refund` (`reason`): the organizer only; full simulated refund of a paid order, stored in `refunds` (`SIM-R-`). Fees are not charged on refunded orders.
  - Cancelled and refunded orders invalidate their tickets (the scanner rejects them) and put the seats back on sale.
  - `PATCH /events/{id}/cancel` now cascades in one transaction: paid orders are refunded, free and pending orders cancelled.
  - Events have an optional `refund_policy` text.
  - **Phase 1 (core ticketing) is complete.**
  - `payments` table: all payments are `provider = "simulated"`, `is_simulated = true`, with `SIM-` references. Failed attempts are committed before raising so they stay on record.
- All repositories flush and all services commit (see Conventions → Transactions)
- Email outbox (Feature 7): `queue_email(...)`, the `email_outbox` table, and the background SMTP sender with retries, templates for every `EMAIL_TEMPLATES` key, Mailpit in Docker Compose (see Conventions → Emails). Registration queues the verification email.
- Email verification and password reset (Feature 7, `account_tokens` table): register queues a `verify_email` link (24 h); `POST /auth/verify-email` `{token}`, `POST /auth/resend-verification` (signed in; 409 if already verified), `POST /auth/forgot-password` `{email}` (always the same 200, so it reveals nothing), `POST /auth/reset-password` `{token, new_password}` (1 h link; signs out every session). Tokens are stored as SHA-256 hashes and used up atomically (`DELETE ... RETURNING`); a new link replaces the old one. Bad, expired or used links: 400 `InvalidAccountTokenError`. `users.email_verified_at` is recorded but **not enforced** yet (open decision: must users verify before ordering?).
- Support cases (Feature 10, `services/support_service.py`, `support_cases` + `support_messages`):
  - `POST /support/cases` with `kind`: `attendee` (exactly one of `event_id` / `order_id` / `ticket_id`; the server fills in the rest and checks the user owns the order/ticket) or `platform` (organizers only, optional own `event_id`). Categories per kind are in `schemas/support.py`.
  - `GET /support/cases/me`, `GET /support/cases/inbox?kind=&status=` (organizer: attendee cases about their events; platform admin: everything), `GET /support/cases/{id}` (case + thread; clients poll it), `POST .../messages`, `PATCH .../status`, `PATCH .../assignee` (`{user_id}` or null).
  - Readers: the requester and the handlers (event organizer for attendee cases, platform admins for all). Anyone else gets 404. Only handlers change status/assignee (403 otherwise); assignees must be handlers. A requester's reply reopens a `waiting_for_customer` or `resolved` case.
  - Emails: replies notify the other side (assignee first), status changes notify the requester, assignment notifies the assignee. Status changes and assignments are audit-logged (`support_case.status_changed`, `support_case.assigned`).
- Admin suspensions (Feature 13, `services/admin_service.py`):
  - `POST /admin/users/{id}/suspend` `{reason}` / `.../unsuspend`: sets `users.suspended_at` + `suspension_reason`, signs the user out everywhere. Suspended users get 403 `UserSuspendedError` at login (after the password check) and on every request (`get_current_user`). Admins can't suspend themselves.
  - `POST /admin/events/{id}/suspend` `{reason}` / `.../unsuspend`: a suspended event is hidden from `GET /events` and `GET /events/{id}` (404) and takes no new orders (404); the organizer still sees it in `/events/me`; issued tickets still scan.
  - All four and organizer approval are audit-logged (`user.suspended`, `event.suspended`, `organizer.approved`, ...).
- Admin search and monitoring (Feature 13): `GET /admin/users` (`q`, `suspended`), `/admin/events` (`q`, `status`, `suspended`), `/admin/orders` (`q` = buyer email/name, `status`, `event_id`), `/admin/payments` (`status`, `purpose`, `event_id`; `status=failed` is the failed-payment monitor), `/admin/refunds` (`event_id`). All answer `{items, total}`, newest first, with `limit` (1–200, default 50) and `offset`; a numeric `q` also matches the id; `%`/`_` in `q` are literal. `?format=csv` downloads every matching row as UTF-8 CSV with a BOM (Excel-friendly).
- Event reports (Feature 13, `event_reports`): `POST /events/{id}/reports` `{reason, details?}` (signed in, public events only; one per user per event, 409 `EventAlreadyReportedError`, guaranteed by a unique constraint). Admins: `GET /admin/event-reports?status=&event_id=` (same paging/CSV as the other admin lists) and `POST /admin/event-reports/{id}/review` `{status: dismissed|actioned, note?}`, audit-logged as `event_report.reviewed`. Suspending the event is a separate admin action.

Roadmap (build in this order; each feature must work end to end before the next):

Phase 1, core ticketing:
1. Finish event fields (venue, capacity, visibility, registration window, ticket max per order) + audit log foundation (4.2, 4.3, 4.9, 4.16)
2. Orders + free registration + tickets with signed QR (4.4, 4.7)
3. Staff assignment + check-in API (4.8). This unblocks the mobile app developer.
4. Paid sales activation, simulated (4.5)
5. Paid checkout: inventory holds with expiry, simulated payment (4.6)
6. Cancellations + refunds (4.9)

Phase 2, rest of the required MVP:
7. Email notifications + email verification + password reset (4.1, 4.10)
8. Printable PDF tickets (4.7)
9. Promo codes + Campaign QR codes (4.14)
10. Support cases (4.13)
11. Organizer analytics (4.15)
12. Event history, activity timeline, duplicate event (4.16)
13. Platform admin tools (4.12)

Automated tests (API, payment, QR validation) are required (SRS §9) and should grow with each feature.

Phase 3, bonus (only after Phases 1–2): assigned seating, calendar .ics export, kk/ru/en localization.

Known issues / polish later (features come first; fix these near the end):
- Ticket-type URLs are inconsistent: `/events/{id}/ticket-type` (singular), `/ticket-types/{id}` and `/ticket_types/{id}/hide` (underscore). Fix together with the frontend developer.
- Tests run against the development database. A separate test database would be safer.
- Gaps found while documenting the API for the mobile app:
  - No "current user" endpoint such as `GET /auth/me`.
  - `GET /events` has no search, filters or paging, and events have no images.
  - `GET /events/{id}/ticket-types` returns 404 for drafts and skips hidden types, even for the organizer.
  - Auth and admin errors return `{"detail": ...}` instead of the unified error format.
- **Bug: email case.** Pydantic lowercases only the domain, so `Ann@x.com` and `ann@x.com` are different accounts, and login is case-sensitive before the `@`. Fix: lowercase emails in `UserCreate`/`UserLogin` (and existing rows) plus a case-insensitive unique index.
- **Bug: private events leak ticket types.** `get_ticket_types_by_event_id_service` checks `status == published` but not `visibility != private`.
- Client-facing auth and permission rules are documented in `docs/auth-and-roles.md`. Update it when permissions change.
- No `.env.example`.
- `AccessTokenResponse` in `schemas/token.py` is unused.
- Expired refresh tokens are only deleted when someone tries to use them; there's no cleanup job.
- Update endpoints use "value if not None else old value", so a field can never be cleared back to null (e.g. removing a category). Fix with `model_dump(exclude_unset=True)`.
- Private events can't be reached by anyone except the organizer yet; invite links are a later feature.
- Endpoint function names are inconsistent (`user_login` vs `refresh_token_router`). Renaming changes operation IDs, so coordinate with the frontend.
