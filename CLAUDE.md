# BiletFlow

BiletFlow is a self-service event-ticketing platform for Kazakhstan, built as a 5-person academic project over 10–12 weeks. Organizers create events and issue free or paid QR-code tickets. Attendees register or buy tickets, and event admins check people in with a mobile app. This repository holds the **backend API**. The web frontend (React + Vite) and the mobile check-in app (React Native) call it.

Source of truth for requirements: the SRS, "BiletFlow_SRS_Initial_Draft.pdf" (v0.3). Section 8 sets the MVP scope; Section 13 has the schedule and team ownership.

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

### Environment variables (`backend/.env`, not committed)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL, e.g. `postgresql://postgres:postgres@localhost:5432/biletflow`. Inside Docker the host is `postgres`, not `localhost`. |
| `SECRET_KEY` | JWT signing key |
| `ALGORITHM` | JWT algorithm, e.g. `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime |

The app crashes at startup if any of these is missing.

## Project structure

```
backend/
  main.py               app setup: routers, exception handlers, CORS
  database.py           engine, SessionLocal, Base, get_db dependency
  dependencies.py       get_current_user, require_platform_admin
  security.py           password hashing, JWT, refresh token generation
  exceptions.py         domain exceptions (plain Exception subclasses)
  exception_handlers.py maps domain exceptions to HTTP status + JSON error body
  models/               SQLAlchemy models (must be imported in models/__init__.py)
  schemas/              Pydantic request/response models
  repositories/         database access only
  services/             business rules, permission checks
  routers/              HTTP endpoints, thin: parse input, call service
  alembic/versions/     migrations
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
- Organizer actions start with `ensure_organizer_approved_service(user_id, db)`. Then compare `organizer.id` with the resource's `organizer_id` and raise `EventAccessDeniedError` on mismatch.

**Data.**
- Money is an **integer number of KZT** (no floats, no decimals).
- All datetimes are timezone-aware: `DateTime(timezone=True)`, created with `datetime.now(timezone.utc)`.
- Statuses are plain strings. Event: `draft` / `published` / `cancelled`. Organizer profile: `pending` / `approved`.

**OpenAPI operation IDs** are generated as `{first tag}-{function name}` (see `main.py`). The frontend generates its API client from these, so **renaming an endpoint function or tag is a breaking change** for the frontend.

**Migrations.**
- After changing a model, run `alembic revision --autogenerate -m "describe change"` and **read the generated file before applying it**.
- Never edit a migration that has already been applied or pushed; add a new one.

**Transactions.** Repositories currently call `db.commit()` themselves. For multi-step operations that must succeed or fail together (token rotation, checkout, refunds), the plan is for the service to own the commit.

## Status (update as features land)

Done:
- Project setup, Docker, Alembic
- Registration and login (JWT)
- Organizer apply and admin approve
- Events: create, update, publish, unpublish, cancel, list published, list mine, public `GET /events/{id}`. Venue, category, capacity, visibility (public/unlisted/private) and a registration window. Publishing needs a venue; drafts and private events return 404 publicly.
- Ticket types: create, list, update, hide and unhide, `max_per_order` (default 10)
- Unified error format, CORS for `http://localhost:5173`
- Refresh tokens: stored as SHA-256 hashes, rotated on every refresh with an atomic `DELETE ... RETURNING`; logout always succeeds

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
- No automated tests yet.
- No `.env.example`.
- `AccessTokenResponse` in `schemas/token.py` is unused.
- Expired refresh tokens are only deleted when someone tries to use them; there's no cleanup job.
- Other repositories still commit themselves; only the refresh-token repository uses `flush()` with the service committing.
- Update endpoints use "value if not None else old value", so a field can never be cleared back to null (e.g. removing a category). Fix with `model_dump(exclude_unset=True)`.
- Private events can't be reached by anyone except the organizer yet; invite links are a later feature.
- Endpoint function names are inconsistent (`user_login` vs `refresh_token_router`). Renaming changes operation IDs, so coordinate with the frontend.
