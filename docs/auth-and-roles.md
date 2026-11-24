# BiletFlow: authentication, roles and permissions

Reference for client implementers, including coding agents. It describes how the backend behaves as of commit `67770a3` (2026-11-12) and was checked against a running server. The backend code is the source of truth; file paths are given so you can verify.

Summary: a login gives a JWT that identifies the **user only**. The server works out every role on each request from database rows, so roles are never in the token. One user can hold several roles at once.

---

## 1. Tokens

### Access token

| Property | Value |
|---|---|
| Format | JWT, `HS256` |
| Claims | `sub`: the user id **as a string** (`"266"`); `exp`: expiry in Unix seconds. Nothing else: no roles, email or `iat`. |
| Lifetime | 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`; read `exp` rather than assuming 30) |
| Sent as | `Authorization: Bearer <access_token>` |
| Revocable | No. It stays valid until `exp`, even after logout. |

The client may base64url-decode the payload, without verifying the signature, to read `sub` (the user id) and `exp`. This is the only way to get your own user id after login, because there's no "current user" endpoint.

### Refresh token

| Property | Value |
|---|---|
| Format | Opaque random string, about 86 URL-safe characters. Not a JWT, so don't decode it. |
| Lifetime | 30 days (`REFRESH_TOKEN_EXPIRE_DAYS`) |
| Storage on server | Only its SHA-256 hash |
| Use | **Single use.** `POST /auth/refresh` deletes it and returns a new access + refresh pair. |
| Concurrency | If two refreshes send the same token at once, exactly one succeeds and the others get `401 InvalidRefreshTokenError`. |

### Sessions

- Every successful `POST /auth/login` creates an **independent session** with its own refresh token, so each device has its own.
- `POST /auth/logout {refresh_token}` deletes only that refresh token and **always returns 200**, even for unknown tokens. Other devices stay logged in.
- After logout the **access token still works until it expires**. The client must delete both tokens locally.
- `POST /auth/register` returns `{id, email}` and **no tokens**. Call login next.
- Login and register take **JSON**, not form data. The "Authorize" button on `/docs` sends form data and doesn't work; ignore it.

### Recommended client token handling

```
on request:
    attach "Authorization: Bearer " + accessToken
    if response.status == 401 and request is not an /auth/* call:
        await refreshOnce()          // single-flight: concurrent callers await the same promise
        retry the request once with the new access token
        if still 401: logout locally, go to the login screen

refreshOnce():
    if a refresh is already running: return that same promise
    POST /auth/refresh {refresh_token}
    on 200: save BOTH new tokens atomically (the old refresh token is now dead)
    on 401: logout locally, go to the login screen
    on a network error: keep the old tokens and surface "offline". If the server consumed the token but the
                        response was lost, the next refresh gets 401 and the user must log in again; that's expected.

optional: refresh proactively when exp - now < 60 seconds
```

Never run two refreshes with the same refresh token. The second one fails and, with naive handling, logs the user out.

---

## 2. How a request is authenticated

`backend/dependencies.py` → `get_current_user`, used by every endpoint except the public ones:

| Situation | Status | Body |
|---|---|---|
| No `Authorization` header | 401 | `{"detail": "Not authenticated"}` |
| Malformed, wrong signature or expired token | 401 | `{"detail": "Invalid token"}` |
| Token valid, but the user no longer exists | **404** | `{"detail": "User Not Found"}`. Treat it like 401: log out. |
| OK | | The user is loaded from the database; then the endpoint's own checks run |

These bodies use `detail`. Every error raised later in the request uses the normal format `{"error", "message", "fields"}`, so the client must handle both shapes.

---

## 3. Roles

| Role | Server decides it by | Stored in | How the client can tell |
|---|---|---|---|
| Anonymous | No token | | |
| User | Valid access token | `users` | Has tokens. Id from JWT `sub`. |
| Organizer applicant | Has an organizer profile with `status = "pending"` | `organizer_profiles` | `GET /organizers/me` → `status: "pending"` |
| Approved organizer | Organizer profile with `status = "approved"` | `organizer_profiles` | `GET /organizers/me` → `status: "approved"` |
| Event owner | Approved organizer **and** `event.organizer_id == organizer_profile.id` | `events.organizer_id` | Compare `event.organizer_id` with `GET /organizers/me` → `id` |
| Event staff | A row `(event_id, user_id)` exists | `staff_assignments` | The event appears in `GET /staff/events` |
| Buyer (of an order) | `order.user_id == current user id` | `orders.user_id` | The order appears in `GET /orders/me` |
| Platform admin | `users.is_platform_admin = true` | `users` | **Not exposed in any response.** Probe `GET /admin/settings`: 200 means admin, 403 means not. |

Important details:

- **`event.organizer_id` is an organizer profile id, not a user id.** Comparing it with the JWT `sub` is a bug.
- Roles **combine**. A user can be an approved organizer, staff for someone else's event and a buyer at the same time. An organizer can also buy tickets to their own event.
- **Staff doesn't require being an organizer.** Any user can be assigned by email.
- **A platform admin has no extra power outside the admin endpoints.** On organizer, buyer or staff endpoints an admin is treated like any other user. For example, an admin with no organizer profile gets `404 OrganizerNotFoundError` on `GET /events/{id}/sales`.
- Becoming admin is only possible directly in the database; there's no endpoint for it.

### Organizer lifecycle

```
user ──POST /organizers/apply──▶ pending ──admin: PATCH /organizers/{user_id}/approve──▶ approved
```

There is no reject, revoke or re-apply endpoint. Applying again returns `409 OrganizerProfileAlreadyExistsError` in any status. Approval happens on another device, so re-fetch `GET /organizers/me` when the app returns to the foreground or the user opens organizer screens.

### Staff lifecycle

The event owner adds staff with `POST /events/{id}/staff {email}` (the user must already exist) and removes them with `DELETE /events/{id}/staff/{user_id}`. Removal takes effect on the next request: the removed user's scans return 403 immediately.

---

## 4. The permission checks, in the order they run

The order matters, because it decides which error the client sees.

### A. Approved organizer: `ensure_organizer_approved_service` (`services/organizer_service.py`)

1. No organizer profile → `404 OrganizerNotFoundError`
2. Profile not approved → `403 OrganizerNotApprovedError`

### B. Event owner: `ensure_event_owner_service` (`services/event_service.py`), and the same logic inline in older services

1. Check A. This runs **before** the event is looked up.
2. Event doesn't exist → `404 EventNotFoundError`
3. Event belongs to another organizer → `403 EventAccessDeniedError`

Consequences:

- A user who isn't an organizer gets `404 OrganizerNotFoundError` on every organizer endpoint, whether or not the event exists.
- A different approved organizer gets `403`, which reveals that the event exists. Attendees never get this, because buyer checks use 404.

For endpoints addressed by ticket type (`PATCH /ticket-types/{id}`, hide and unhide), the order is: A → ticket type exists (`404 TicketTypeNotFoundError`) → its event → owner (`403`).

### C. Scanner: `ensure_can_scan_service` (`services/staff_service.py`)

1. Event doesn't exist → `404 EventNotFoundError`
2. User is assigned staff for this event → allowed
3. User has an organizer profile that owns this event → allowed (approval isn't re-checked here)
4. Otherwise → `403 NotEventStaffError`

Event status isn't checked here. Scanning a cancelled event's ticket returns `200` with `result: "event_cancelled"`.

### D. Buyer (order or ticket owner)

The order's (or the ticket's order's) `user_id` must equal the current user. Otherwise the endpoint returns **`404 OrderNotFoundError`** or **`404 TicketNotFoundError`**, never 403, so other people's orders look like they don't exist. **The event's organizer is not the buyer:** they get 404 on `GET /orders/{id}` and on the QR image for attendees' tickets. They use the attendee list instead.

### E. Platform admin: `require_platform_admin` (`dependencies.py`)

Not an admin → `403 {"detail": "Access denied"}`, in the `detail` shape.

---

## 5. Permission matrix (all 48 endpoints)

Check letters refer to section 4. "Status rules" (wrong event or order status) come after the permission check and are listed in the API reference.

### Accounts: public

| Endpoint | Who | Notes |
|---|---|---|
| `POST /auth/register` | Anyone | Returns no tokens |
| `POST /auth/login` | Anyone | `401 InvalidCredentialsError` for an unknown email **or** a wrong password; you can't tell which |
| `POST /auth/refresh` | Anyone holding a refresh token | No access token needed |
| `POST /auth/logout` | Anyone holding a refresh token | Always 200 |

### Events

| Endpoint | Who | Denied with |
|---|---|---|
| `GET /events` | Anyone | Returns only `status = published` **and** `visibility = public` |
| `GET /events/{id}` | Anyone | `404 EventNotFoundError` if not published, or if `private`. `unlisted` is returned. |
| `GET /events/me` | Approved organizer (A) | Own events, any status and visibility |
| `POST /events` | Approved organizer (A) | |
| `PATCH /events/{id}` | Owner (B) | |
| `PATCH /events/{id}/publish` | Owner (B) | |
| `PATCH /events/{id}/unpublish` | Owner (B) | |
| `PATCH /events/{id}/cancel` | Owner (B) | |

### Ticket types

| Endpoint | Who | Denied with |
|---|---|---|
| `GET /events/{id}/ticket-types` | Anyone | `404 EventNotFoundError` unless the event is published. Visibility **isn't** checked (see section 9). Hidden types are left out, even for the owner. |
| `POST /events/{id}/ticket-type` | Owner (B) | |
| `PATCH /ticket-types/{id}` | Owner (B, by ticket type) | |
| `PATCH /ticket_types/{id}/hide` | Owner (B, by ticket type) | |
| `PATCH /ticket_types/{id}/unhide` | Owner (B, by ticket type) | |

### Orders and tickets

| Endpoint | Who | Denied with |
|---|---|---|
| `POST /events/{id}/orders` | Any user | `404 EventNotFoundError` if the event isn't published or is `private` |
| `GET /orders/me` | Any user | Only the caller's orders |
| `GET /orders/{id}` | Buyer (D) | `404 OrderNotFoundError` for everyone else, including the organizer |
| `POST /orders/{id}/pay` | Buyer (D) | `404 OrderNotFoundError` |
| `POST /orders/{id}/cancel` | Buyer (D) **or** owner (B) | `404 OrderNotFoundError` if neither |
| `POST /orders/{id}/refund` | Owner (B) only | Buyer who isn't the owner → `403 EventAccessDeniedError`. Anyone else → `404 OrderNotFoundError`. |
| `GET /tickets/{id}/qr` | Buyer (D) | `404 TicketNotFoundError` for everyone else, including the organizer |
| `GET /events/{id}/attendees` | Owner (B) | |
| `GET /events/{id}/sales` | Owner (B) | |

### Staff and scanning

| Endpoint | Who | Denied with |
|---|---|---|
| `POST /events/{id}/staff` | Owner (B) | |
| `GET /events/{id}/staff` | Owner (B) | |
| `DELETE /events/{id}/staff/{user_id}` | Owner (B) | |
| `GET /staff/events` | Any user | Never denied. Returns events the user is assigned to **plus** events they organize, excluding drafts but **including cancelled** ones, sorted by start time. Empty means not a scanner. |
| `POST /events/{id}/check-in` | Scanner (C) | |
| `POST /events/{id}/check-in/undo` | Scanner (C) | Any scanner may undo any check-in for that event |
| `GET /events/{id}/check-in/search` | Scanner (C) | |
| `GET /events/{id}/check-in/stats` | Scanner (C) | |

### Organizer profile

| Endpoint | Who | Denied with |
|---|---|---|
| `POST /organizers/apply` | Any user | `409 OrganizerProfileAlreadyExistsError` if a profile exists |
| `GET /organizers/me` | Any user with a profile (pending or approved) | `404 OrganizerNotFoundError` |
| `POST /organizers/me/verification` | Approved organizer (A) | |
| `PUT /organizers/me/payout-account` | Approved organizer (A) | |

### Paid sales activation

| Endpoint | Who |
|---|---|
| `GET /events/{id}/paid-sales` | Owner (B) |
| `POST /events/{id}/paid-sales/accept-terms` | Owner (B) |
| `POST /events/{id}/paid-sales/pay-fee` | Owner (B) |
| `POST /events/{id}/paid-sales/activate` | Owner (B) |

### Platform admin

| Endpoint | Who | Notes |
|---|---|---|
| `PATCH /organizers/{user_id}/approve` | Admin (E) | The path takes the applicant's **user id**, not the profile id. Approving twice is fine. |
| `GET /admin/paid-sales` | Admin (E) | |
| `POST /admin/events/{id}/paid-sales/suspend` | Admin (E) | |
| `POST /admin/events/{id}/paid-sales/reinstate` | Admin (E) | |
| `GET /admin/settings` | Admin (E) | Also the way to detect admin status |
| `PUT /admin/settings/activation-fee` | Admin (E) | |

---

## 6. What anonymous users and attendees can see

| Event status | Visibility | In `GET /events` | `GET /events/{id}` | Can order | Ticket-type list |
|---|---|---|---|---|---|
| `draft` | any | No | 404 | No (404) | 404 |
| `published` | `public` | Yes | Yes | Yes | Yes |
| `published` | `unlisted` | No | Yes, by id or link | Yes | Yes |
| `published` | `private` | No | 404 | No (404) | **Yes** (inconsistency, section 9) |
| `cancelled` | any | No | 404 | No (404) | 404 |

The owner sees all their events through `GET /events/me`.

---

## 7. Client-side role detection

UI gating is cosmetic, and the server enforces everything. Always handle 401, 403 and 404 even when the UI hides an action.

```
after login (and when the app returns to the foreground):
    userId          = int(decodeJwtPayload(accessToken).sub)
    organizer       = GET /organizers/me           // 404 → null
    organizerState  = organizer?.status ?? "none"  // "none" | "pending" | "approved"
    scannerEvents   = GET /staff/events            // [] → hide the scanner tab
    isAdmin         = (GET /admin/settings).status == 200   // only if the app has admin screens

per event:
    isOwner  = organizerState == "approved" && event.organizer_id == organizer.id
    canScan  = scannerEvents.some(e => e.id == event.id)

per order:
    isBuyer  = order came from GET /orders/me
    canCancel   = (isBuyer || isOwner) && (order.status == "pending" || (order.status == "confirmed" && order.total_amount == 0))
    canRefund   = isOwner && order.status == "confirmed" && order.total_amount > 0
```

Notes:

- Use the organizer **profile** `id` for ownership, never the user id.
- `GET /staff/events` returns cancelled events too. Hide them in a scanner list, or show them as cancelled.
- The organizer's own events appear in `GET /staff/events`, because owners can scan.

---

## 8. Mapping errors to client behaviour

| Response | Meaning | Client action |
|---|---|---|
| `401 {"detail": ...}` | Missing, invalid or expired access token | Refresh once (section 1), retry, else log out |
| `401 InvalidRefreshTokenError` | Refresh token used, expired or unknown | Log out |
| `401 InvalidCredentialsError` | Wrong email or password | Show "Wrong email or password" |
| `404 {"detail": "User Not Found"}` | The account was deleted | Log out |
| `404 OrganizerNotFoundError` | Not an organizer | Show the "Become an organizer" flow |
| `403 OrganizerNotApprovedError` | Waiting for approval | Show "Pending approval" |
| `403 EventAccessDeniedError` | Not the owner | Hide organizer actions for this event |
| `403 NotEventStaffError` | Not staff here (or removed) | Leave the scanner; refresh `GET /staff/events` |
| `403 {"detail": "Access denied"}` | Not a platform admin | Hide admin screens |
| `404 OrderNotFoundError` / `TicketNotFoundError` | Not yours, or doesn't exist | Show "not found" |

The `message` field is a fixed English label (one even has a typo: "Organizer Not Aproved"). Base logic on `error`, never on `message`.

---

## 9. Current inconsistencies to code around

These are backend issues and may be fixed later.

1. **Email case sensitivity.** Pydantic lowercases only the domain (`Ann@Example.com` is stored as `Ann@example.com`). The part before `@` stays case-sensitive: logging in as `ann@example.com` returns 401, and registering `ann@example.com` creates a **second account**. **Client: `trim()` and lowercase the email before register and login.**
2. **Private events leak their ticket types.** `GET /events/{id}/ticket-types` checks only `status == published`, not visibility. Don't rely on it for privacy.
3. **Two error body shapes:** `detail` for authentication and admin errors, `error` for everything else.
4. **No current-user endpoint.** Get the id from the JWT, the organizer state from `GET /organizers/me`, and the admin flag by probing. No endpoint returns the logged-in user's own profile, so store the email the user logged in with.
5. **Organizers get 403 for other organizers' events**, while attendees get 404 for other people's orders.
6. **Hidden ticket types and draft events.** The owner can't list hidden ticket types, or any ticket types of a draft event, through the API. Keep ids from the create responses.
7. **No organizer rejection or revocation.** An applicant stays `pending` until approved.
