# Onboarding: Dev B and Dev B's Claude

**For Claude:** you're helping **Dev B**, the second backend developer on BiletFlow. Read this whole file before doing anything. `CLAUDE.md` in the repo root is loaded automatically and holds the conventions; this file adds the context, the setup, how the two developers work together, and Dev B's tasks with their specs. **Where the two disagree, `CLAUDE.md` wins**, because it's kept up to date and this file is a snapshot from 2026-11-24.

Dev A (the first backend developer) wrote the backend so far with another Claude. **Nothing from that Claude's memory is available to you.** What it knew is in `CLAUDE.md`, `docs/` and this file.

---

## 1. The project in short

- **BiletFlow** is a self-service event-ticketing platform for Kazakhstan, built as a 5-person university project. Organizers create events and sell free or paid tickets with QR codes, attendees register or buy, and event staff scan tickets at the door.
- **Requirements:** the SRS, "BiletFlow_SRS_Initial_Draft.pdf" (v0.3). Ask Dev A for it if it isn't in `docs/` yet. The SRS lists the features (§4), the MVP scope (§8), the non-functional requirements (§7) and the success criteria (§11).
- **Scope change by the team:** the mobile app (React Native) does everything the website does, plus scanning. This overrides the SRS, which excludes native attendee and organizer apps.
- **All money is simulated.** No real payments, payouts or identity checks.
- **This repo is the backend only.** Two other teammates build the web app (React + Vite) and the mobile app. They call this API.
- **The submission date is unknown.** The plan below assumes 4 weeks. Ask Dev A whether it has been confirmed.

## 2. Where the backend stands (2026-11-24)

About **60%** of the backend is done.

| | |
|---|---|
| Commits | 27 on `main`; the last feature landed on 2026-11-04 |
| Endpoints | 48 (see `/docs` on a running server, and `docs/api-reference.md` once it's in the repo) |
| Tests | 8 end-to-end test files, 180 checks, all passing |
| Done | Accounts and JWT login, refresh-token rotation, organizer apply and approve, events, ticket types, orders, free registration, paid checkout with 10-minute holds, QR tickets, staff and check-in, simulated paid-sales activation, cancellations, refunds, audit log, sales summary |
| Not started | Emails, email verification, password reset, PDF tickets, promo codes, support cases, analytics, event history, admin tools, event images, search and paging |

The **Status** section of `CLAUDE.md` describes every finished feature. `docs/auth-and-roles.md` describes the auth and permission rules in detail; read it before touching anything auth-related.

---

## 3. Setting up on Windows

Dev B works on Windows. Nothing in the backend is Linux-only, and Dev A works in WSL Ubuntu. The only differences are the venv commands and line endings.

### Install

- Git for Windows
- Python **3.12** from python.org (tick "Add Python to PATH")
- Docker Desktop (it needs virtualization enabled in the BIOS; it sets up WSL2 itself)
- An editor (VS Code) and Claude Code

### First run (PowerShell)

```powershell
git clone https://github.com/aaskhaatt/BiletFlow.git
cd BiletFlow
git config core.autocrlf false
docker compose up -d postgres
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell refuses to run `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Create `backend\.env`. Copy `backend\.env.example` if it exists, otherwise create it with these values:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/biletflow
SECRET_KEY=<your own random value>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
```

Generate your own `SECRET_KEY` with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. **Never use or share Dev A's.**

Then:

```powershell
alembic upgrade head
python tests/run_all.py
uvicorn main:app --reload
```

`run_all.py` must end with `ALL PASSED: 8 test files`. The API is at `http://localhost:8000`, with interactive docs at `/docs`.

### Windows gotchas

- **Line endings.** The repo uses LF everywhere. Keep `core.autocrlf false`, and make sure your editor saves `.py` and `.md` files with LF. If a pull request suddenly shows every line as changed, that's the cause. A `.gitattributes` containing `* text=auto eol=lf` fixes it permanently; add it if it isn't there.
- **Port 5432.** If Postgres is also installed natively on Windows, it occupies the port and Docker's Postgres won't start. Stop that service, or map Docker to another port and change `DATABASE_URL`.
- **Making a platform admin** (there's no endpoint for it):
  ```powershell
  docker exec -it biletflow_postgres psql -U postgres -d biletflow -c "update users set is_platform_admin = true where email = 'you@example.com';"
  ```
- **Tests** start their own server on port 8011 and use the database from `backend\.env`. They delete everything they create. Server errors during a run are written to `backend\tests\e2e\server.log`.

---

## 4. How the code works (a 10-minute tour)

Every request follows the same path. `CLAUDE.md` has the full rules; this is the map.

```
routers/      HTTP only: parse input, Depends(get_current_user), call one service function
services/     business rules + permission checks + ONE db.commit() per action + log_action(...)
repositories/ database access only: add/update, then db.flush(), NEVER commit
models/       SQLAlchemy tables (register new ones in models/__init__.py)
schemas/      Pydantic request/response models
exceptions.py + exception_handlers.py   domain errors → HTTP status (register every new one in ERRORS)
```

Read these files in this order, and you'll know the codebase:

1. `services/auth_service.py`: registration, login, refresh-token rotation. Your area.
2. `dependencies.py`: `get_current_user` and `require_platform_admin`. Your area.
3. `services/order_service.py`, `create_order_service`: the most complete example of the rules (validation, atomic inventory, one commit, audit log). Dev A's area, but it's the reference.
4. `services/cancellation_service.py`: locking and the lock-order rule.
5. `tests/e2e/helpers.py` and `tests/e2e/test_refunds.py`: how tests are written.

### The patterns you must follow

All of these are in `CLAUDE.md`, and the reviewer checks them:

- **One commit per action**, in the service. Repositories only `flush()`. A missing commit loses data silently.
- **Concurrency:**
  - When a check and a change fit in one statement, use an atomic `UPDATE ... WHERE <condition> RETURNING`.
  - When something must happen between the check and the write, use `SELECT ... FOR UPDATE` plus `populate_existing=True`.
  - To create-if-missing, use `INSERT ... ON CONFLICT`.
  - Unique constraints are the last guarantee.
- **Lock order:** event → its orders → ticket types.
- **Secrets are stored hashed** (SHA-256 for random tokens, bcrypt for passwords). Single-use tokens are consumed with an atomic `DELETE ... RETURNING`, like `consume_refresh_token`. Your verification and reset tokens follow the same pattern.
- **Errors:** raise domain exceptions, never `HTTPException` in services.
- **Audit:** every state-changing organizer or admin action calls `log_action(...)` before the commit.
- **Money** is an integer number of KZT. **Datetimes** are timezone-aware.
- **Every feature gets its own `tests/e2e/test_<feature>.py`**, and the whole suite must pass before merging.
- **Don't rename existing endpoint functions or tags.** The frontends generate their API clients from the operation IDs.

---

## 5. How the two developers work together

### Who owns what

Each developer owns **files**, so you rarely edit the same code.

| Dev A owns | Dev B (you) owns |
|---|---|
| `order_service`, `cancellation_service`, `event_service`, `ticket_type_service`, `ticket_service`, `check_in_service`, `staff_service`, `paid_sales_service`, `payment_service`, and their repositories, schemas and routers | `auth_service`, `organizer_service`, `dependencies.py`, users, and **new** modules for email, support and admin tools |

Editing a file the other developer owns is allowed when a task needs it. Say so in the daily check-in, keep the change small, and the owner reviews that pull request.

### Git

- Never commit to `main`. One branch per task: `b/<task>`, for example `b/auth-me`.
- Small pull requests: one task, ideally under 400 changed lines. **The other developer reviews every pull request** (SRS §13.2). Review each other's within one day.
- Before opening a pull request: `git pull origin main` into your branch, fix conflicts, run `python tests/run_all.py`.
- In the same pull request as the code, update the `CLAUDE.md` Status section (your feature's lines only) and the relevant `docs/` file.

### Migrations, the biggest risk

If both developers create a migration on separate branches, both point to the same parent, and after merging Alembic has **two heads**.

- Before merging a branch with a migration, pull `main`. If `main` gained a migration meanwhile, **delete yours and regenerate it** with `alembic revision --autogenerate -m "..."`, then read the generated file.
- A migration is final once it's merged into `main`. Never edit a merged one.
- Each developer uses their own local database.
- Mention "I'm adding a migration" in the daily check-in.

### Files you'll both edit

| File | How to keep conflicts small |
|---|---|
| `exceptions.py`, `exception_handlers.py` | Add your errors in a block with a comment naming your feature, not at the very end |
| `main.py` | One import and one `include_router` per router |
| `models/__init__.py` | One line per model |
| `tests/e2e/helpers.py` | Add new helpers; agree before changing existing ones |
| `requirements.txt` | Announce new packages; the other developer runs `pip install -r requirements.txt` after pulling |
| `CLAUDE.md` | Only your own feature's lines |

### Daily check-in (10 minutes)

What I merged, what I'm on, what blocks me, whether I'm adding a migration or a package.

---

## 6. The interfaces between Dev A's work and yours

These are agreed contracts. Build them exactly like this so Dev A can rely on them.

### `queue_email` (you build it on day 1; Dev A calls it)

```python
# services/email_service.py
def queue_email(db: Session, to_email: str, template: str, data: dict) -> None:
    """Saves an email to the email_outbox table in the CALLER's transaction (add + flush, no commit).
    If the caller's action rolls back, the email is never sent."""
```

Table `email_outbox`:

| Column | Type |
|---|---|
| `id` | int |
| `to_email` | str |
| `template` | str |
| `data` | JSONB |
| `status` | `pending` / `sent` / `failed` |
| `attempts` | int |
| `last_error` | str, nullable |
| `created_at` | timestamptz |
| `sent_at` | timestamptz, nullable |

**Day 1:** only the table, the function and a test that a row appears after a free order. Nothing is sent yet. Merge it fast.

Template names and `data` keys. Dev A sends these from their flows; you write the templates:

| Template | Sent when | `data` |
|---|---|---|
| `order_confirmed` | Free order created, or paid order paid | `order_id, event_title, event_start, buyer_name, total_amount, ticket_count` |
| `payment_failed` | Simulated payment declined | `order_id, event_title, total_amount` |
| `order_cancelled` | Order cancelled | `order_id, event_title` |
| `order_refunded` | Order refunded | `order_id, event_title, total_amount, reason` |
| `event_cancelled` | Event cancelled (one per order) | `event_title, order_id, refunded` (bool) |
| `event_updated` | Time or venue changed (one per confirmed order) | `event_title, changes` (text) |
| `verify_email` | Registration, resend | `link` |
| `password_reset` | Forgot password | `link` |
| `support_message` | New reply in a support case | `case_id, subject, author` |
| `support_status_changed` | Case status changed | `case_id, subject, status` |
| `organizer_approved` | Admin approved an organizer | none |

### Suspensions (you build them; they touch Dev A's files)

Admins can suspend users and events (SRS 4.12).

- **Users:** add `users.is_suspended`. `get_current_user` rejects suspended users with a new `UserSuspendedError` (403), and login refuses them. This is all in your files.
- **Events:** add `events.is_suspended`. A suspended event must behave like an unpublished one for the public: not listed, 404 on its page, and **no new orders**. That means small changes in `event_service.get_public_event_service`, `event_repository.get_published_events` and `order_service.create_order_service`, which are **Dev A's files, so Dev A reviews that pull request**.

---

## 7. Your tasks

Each task is one branch and one pull request with its own test file. Do them in this order.

### Week 1: unblock the mobile app

**B1. `queue_email` stub** (day 1, about 2 h): section 6. Test: a free order creates one `order_confirmed` row once Dev A adds the call; until then, call `queue_email` directly in the test.

**B2. `GET /auth/me`** (about 3 h, **built on branch `b/auth-me`**). Any logged-in user. Returns:

```json
{
  "id": "int",
  "email": "string",
  "is_platform_admin": "boolean",
  "organizer": { "id": "int", "user_id": "int", "status": "pending | approved" },
  "is_event_staff": "boolean"
}
```

`organizer` is `null` without a profile. `is_event_staff` means assigned to at least one non-draft event, the same rule as `GET /staff/events`. Apps show the scanner if `is_event_staff` **or** the organizer is approved. Add `email_verified` in B6. Update `docs/auth-and-roles.md` section 7: the probing workarounds become "call `/auth/me`".

**B3. Email-case bug** (about 3 h):
- In `UserCreate` and `UserLogin`, strip and lowercase the email (a `field_validator`).
- Add a migration that lowercases existing emails, then a unique index on `lower(email)`: `op.create_index("ux_users_email_lower", "users", [sa.text("lower(email)")], unique=True)`.
- Make `get_user_by_email` compare lowercased.
- Test: register `Ann@Example.com`; logging in as `ann@example.com` works; registering `ANN@example.com` gives 409.

**B4. One error format for auth** (about 3 h):
- In `dependencies.py`, replace the `HTTPException`s with domain errors so every error uses `{"error", "message", "fields"}`:
  - missing header → `NotAuthenticatedError` (401)
  - bad or expired token → `InvalidTokenError` (401)
  - deleted user → `UserNotFoundError` (401, not 404: it means "log in again")
  - not an admin → `AdminRequiredError` (403)
- Use `OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)` so a missing header reaches your code.
- **Tell the web and mobile developers before merging**, because their error handling changes. Update `docs/auth-and-roles.md`.

**B5. CI and hosting** (about 6 h):
- `.github/workflows/tests.yml`: on every pull request, start a `postgres:16` service, install Python 3.12 and the requirements, set the five env vars, run `alembic upgrade head` and `python tests/run_all.py`. The code reads env vars directly, so no `.env` file is needed in CI.
- A hosted test server (Render, Railway or a small VPS; agree with Dev A) with its own Postgres, running `alembic upgrade head` on each deploy, with HTTPS. Add its URL to CORS and give it to the web and mobile developers.
- Never commit secrets.

### Weeks 2–3: required features

**B6. Emails, verification and password reset** (SRS 4.1, 4.10, about 18 h):

- **Fake inbox:** add Mailpit to `docker-compose.yml` (SMTP on 1025, web inbox on 8025).
- **Settings:** new env vars `SMTP_HOST` (default `localhost`), `SMTP_PORT` (1025), `SMTP_FROM`, `APP_BASE_URL` (for links). Add them to the `CLAUDE.md` env table.
- **Sender:**
  - A background loop like `background.py`, started in the same lifespan.
  - It claims pending rows with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20`, so two server processes never send the same email.
  - It sends with `smtplib` and marks rows `sent`, or retries up to 3 times, then marks them `failed`.
- **Templates:** plain text plus simple HTML, English for now.
- **Email verification:**
  - Add `users.email_verified_at`.
  - On registration, queue `verify_email` with a random token. Store only the token's hash, with a 24-hour expiry.
  - `POST /auth/verify-email {token}` consumes it atomically. `POST /auth/resend-verification` sends a new one.
  - Verification is **not** required to log in; the SRS only says users "shall be able to verify".
- **Password reset:**
  - `POST /auth/forgot-password {email}` **always returns 200**, so it never reveals whether an account exists. It queues `password_reset` with a single-use token (hashed, 1-hour expiry).
  - `POST /auth/reset-password {token, new_password}` consumes the token atomically, sets the new password and **deletes all of that user's refresh tokens**, which logs out every device.
- **`organizer_approved` email:** sent from `approve_organizer_service`.
- **Tests** (`test_emails.py`): rows are queued in the right transactions, verify and reset happy paths, expired and reused tokens rejected, and forgot-password returns 200 for unknown emails.

**B7. Support cases** (SRS 4.13, about 17 h):

- **Tables:**
  - `support_cases`: `id`, `requester_user_id`, `kind` (`attendee` | `organizer`), `event_id`, `order_id`, `ticket_id` (all nullable), `category`, `subject`, `status` (`open`, `in_progress`, `waiting_for_customer`, `resolved`), `assigned_to_user_id`, `escalated` (bool), `created_at`, `updated_at`
  - `support_messages`: `id`, `case_id`, `author_user_id`, `body`, `created_at`
- **Categories:** ticket delivery, payment, refund, seating, event information, check-in, account, technical.
- **Context is filled automatically:** given an `order_id` or `ticket_id`, derive the event, and **check that the requester owns that order or ticket**.
- **Who can access a case:**
  - attendee cases: the requester and that event's owner (organizer)
  - organizer cases: the requester and platform admins
  - escalated attendee cases: platform admins too
  - everyone else gets **404**
- **Endpoints:**
  - `POST /support/cases`
  - `GET /support/cases`: cases I opened plus cases I handle, filter by status, newest first
  - `GET /support/cases/{id}`, with its messages
  - `POST /support/cases/{id}/messages`
  - `PATCH /support/cases/{id}`: status, assignee or escalation, handlers only
  - `GET /support/cases/{id}/messages?after=<message_id>` for polling. The SRS says polling is enough, so no WebSockets.
- **Side effects:** `support_message` and `support_status_changed` emails, plus `log_action` on status changes with `event_id`. The SRS 4.16 timeline shows support status changes.
- **Tests:** `test_support.py`, including access denied for strangers and for other organizers.

**B8. Platform admin tools** (SRS 4.12, about 15 h). All under `require_platform_admin`.

- **Search:**
  - `GET /admin/users?q=`
  - `GET /admin/events?q=&status=`
  - `GET /admin/orders?q=&status=`
  - `GET /admin/payments?status=` (failed payments)
  - `GET /admin/refunds`
  - all paged with `limit` and `offset`
- **Suspensions:** `POST /admin/users/{id}/suspend|unsuspend` and `POST /admin/events/{id}/suspend|unsuspend`, as section 6 describes. Audit-logged.
- **Event reports:** `POST /events/{id}/report {reason}` for any logged-in user, then `GET /admin/reports` and `POST /admin/reports/{id}/resolve`.
- **Escalated support cases:** `GET /admin/support-cases?escalated=true`.
- **Promo activity:** `GET /admin/campaigns`, after Dev A's promo codes are merged.
- **CSV export:** `GET /admin/exports/{orders|payments|users}.csv`.
- **Fix the known gap:** `approve_organizer_service` must receive the admin's id and call `log_action`.
- **Tests:** `test_admin.py`, including that a suspended event stops selling and a suspended user can't log in.

### Week 4: integration and final checks

- Fix what the web and mobile developers hit in your areas.
- Final deployment: database **backups** (an SRS §7 requirement), real secrets, CORS for the hosted web app.
- Polish: a cleanup job for expired refresh, verification and reset tokens, and a separate test database for CI.
- With Dev A: walk through every SRS §11 success criterion on the hosted server and fix what fails.

**No new features after week 3** (SRS §13.4). If time runs short, cut in this order: CSV exports and event reports → support-case assignment → every email except verification, reset and `order_confirmed`.

---

## 8. Dev A's tasks, so you know what's coming

- **Week 1:** event images (MinIO storage), event search and paging, owner ticket-type listing, the private-event ticket-type leak.
- **Week 2:** PDF tickets, adding `queue_email` calls, promo codes.
- **Week 3:** Campaign QR codes, analytics, event history and duplication.
- **Week 4:** demo data script, integration fixes.

You review all of these pull requests. Look especially at commits, locking, permission checks and tests.

---

## 9. Definition of done, for every task

- [ ] Follows the layers and patterns in `CLAUDE.md`
- [ ] Every new error registered in `ERRORS`; every organizer or admin state change audit-logged
- [ ] Its own `tests/e2e/test_<feature>.py`, and `python tests/run_all.py` passes completely
- [ ] Migration generated, read and, if needed, regenerated on top of the latest `main`
- [ ] `CLAUDE.md` Status updated, and `docs/api-reference.md` / `docs/auth-and-roles.md` updated if endpoints or permissions changed
- [ ] The web and mobile developers told about any change to existing responses
- [ ] Reviewed and approved by Dev A
