# BiletFlow API Reference

Nov 25, 2026 · @askhat

All requests and responses are JSON, except the cover-image upload (a multipart form) and the ticket QR (a PNG). Local server: `http://localhost:8000` (Android emulator: `http://10.0.2.2:8000`).

Send `Authorization: Bearer <access_token>` unless an endpoint says **Public**. Each endpoint line shows the method and path, success status, and who can call it.

In the types, `?` means optional, `| null` means the value can be null, and `datetime` is ISO 8601 with a timezone (`2026-12-01T19:00:00+05:00`). Money is a whole number of KZT. All payments are simulated.

## What changed on November 25 (answers to the web team's questions)

Nothing was renamed or removed; every change adds fields, endpoints or rules.

| Change | Endpoint |
| --- | --- |
| Availability per ticket type: `available`, `max_now`, `on_sale`, `unavailable_reason` | `GET /events/{event_id}/ticket-types`, `.../ticket-types/manage` |
| A cancelled event that was once public keeps its public page (`status: cancelled`, `cancelled_at`); its ticket types are listed as not on sale | `GET /events/{event_id}` |
| `organizer_name`, `published_at`, `cancelled_at` on every event | all event responses |
| `min_price` and `tickets_remaining` on catalogue cards | `GET /events` |
| Every order carries an `event` summary (title, dates, venue, status, image) | all order responses, `GET /orders/me` |
| The organizer's home page in one call: tickets sold, revenue, paid-sales status per event | `GET /events/me/summary` |
| Who scanned a ticket and when: `checked_in_by`, `checked_in_at` | attendee list, scan, undo, search |
| Organizer public name: `display_name` on apply and a new `PATCH /organizers/me` | `/organizers/...` |
| Admins list applications, reject with a reason; a rejected user can apply again | `GET /admin/organizers`, `POST /admin/organizers/{user_id}/reject` |
| Support case `history`: status changes and assignments | `GET /support/cases/{case_id}` |
| Change password while signed in | `POST /auth/change-password` |
| The whole audit log for admins | `GET /admin/audit-log` |
| New rules (409): can't unpublish with tickets sold, can't cancel an ended event, can't cancel a free registration after a ticket was scanned or the event ended, can't edit a cancelled event or its ticket types | see each endpoint |

## What changed since November 5

Everything below is on main and works now. **`GET /events` returning `{items, total}` is the one breaking change.**

| Change | Endpoint | Status |
| --- | --- | --- |
| Search, filters and paging. **Breaking:** the response is now `{items, total}`, not a list | `GET /events` | On main |
| Category list for the filter dropdown | `GET /events/categories` | On main |
| Cover images, and `image_url` on every event | `PUT` and `DELETE /events/{event_id}/image` | On main |
| The organizer's own ticket-type list, hidden types and drafts included | `GET /events/{event_id}/ticket-types/manage` | On main |
| Ticket types of private events answer 404 publicly | `GET /events/{event_id}/ticket-types` | On main |
| Printable PDF tickets | `GET /tickets/{ticket_id}/pdf`, `GET /orders/{order_id}/pdf` | On main |
| Promo codes: `promo_code` on orders, a price preview, `discount_amount` on orders, `discounts` in sales | `/events/{event_id}/campaigns`, `/campaigns/{campaign_id}`, `POST /events/{event_id}/orders/preview` | On main |
| Campaign QR codes (orange frame, "NOT AN ENTRY TICKET") | `GET /campaigns/{campaign_id}/qr`, `GET /campaign-links/{token}` | On main |
| Organizer analytics (`absent` included) | `GET /events/{event_id}/analytics` | On main |
| Event history (admins too), `lifecycle` on every event, duplicate event | `GET /events/{event_id}/history`, `GET /events/me?lifecycle=`, `POST /events/{event_id}/duplicate` | On main |
| The organizer's order list with payment and refund records | `GET /events/{event_id}/orders` | On main |
| A name per ticket: `attendee_names` on order items | `POST /events/{event_id}/orders` | On main |
| Preview a draft | `GET /events/{event_id}/manage` | On main |
| PATCH: `null` clears an optional field; required fields refuse `null` | `PATCH /events/{event_id}`, `PATCH /ticket-types/{ticket_type_id}` | On main |
| Who am I (`email_verified` included) | `GET /auth/me` | On main |
| Email verification and password reset | `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password` | On main |
| Support cases with message threads | `/support/cases...` | On main |
| Report an event | `POST /events/{event_id}/reports` | On main |
| Admin tools: search lists with CSV, suspensions, event reports, promo-code activity | `/admin/...` | On main |
| Suspended accounts get `403 UserSuspendedError`; suspended events disappear and take no orders or payments | all | On main |
| One error body everywhere; a deleted account's token answers 401 | all | On main |
| Emails are case-insensitive: `Aida@Mail.kz` and `aida@mail.kz` are one account | register, log in, assign staff | On main |
| Every email is in Kazakh, Russian and English | (emails) | On main |

## Accounts and login

`Tokens`

```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "string"
}
```

### Register

`POST /auth/register` · `201` · Public

Request:

```json
{
  "email": "string (email)",
  "password": "string (min 6)"
}
```

Response:

```json
{
  "id": "int",
  "email": "string (saved in lowercase: Aida@Mail.kz and aida@mail.kz are one account)",
  "email_verified_at": "datetime | null"
}
```

Registration emails a verification link (see Verify email). Ordering doesn't require a verified email.

### Log in

`POST /auth/login` · `200` · Public

Request:

```json
{
  "email": "string (email)",
  "password": "string"
}
```

Response: `Tokens`

### Refresh tokens

`POST /auth/refresh` · `200` · Public

A refresh token works once, so save both new tokens.

Request:

```json
{
  "refresh_token": "string"
}
```

Response: `Tokens`

### Log out

`POST /auth/logout` · `200` · Public

Request:

```json
{
  "refresh_token": "string"
}
```

Response:

```json
{
  "message": "string"
}
```

### Who am I

`GET /auth/me` · `200` · Logged-in

Call it after login and on app start to pick the screens: organizer tools when `organizer.status` is `approved`, the scanner when `is_event_staff` is true or the user is an approved organizer, admin tools when `is_platform_admin` is true.

Response:

```json
{
  "id": "int",
  "email": "string",
  "is_platform_admin": "boolean",
  "email_verified": "boolean",
  "organizer": {
    "id": "int",
    "user_id": "int",
    "status": "pending | approved | rejected",
    "display_name": "string | null",
    "rejection_reason": "string | null (set when status is rejected)"
  },
  "is_event_staff": "boolean"
}
```

`organizer` is `null` if the user never applied. With `rejected`, show `rejection_reason` and an "apply again" button (`POST /organizers/apply`). `is_event_staff` means assigned as check-in staff to at least one event that isn't a draft.

### Verify email

`POST /auth/verify-email` · `200` · Public

The web page behind the emailed link (`{FRONTEND_URL}/verify-email?token=...`) sends the token here. The link works once, for 24 hours. A bad, used or expired link: `400 InvalidAccountTokenError`.

Request:

```json
{
  "token": "string (from the link)"
}
```

Response: `{"message": "Email verified"}`

### Resend the verification email

`POST /auth/resend-verification` · `200` · Logged-in

A new link replaces the old one. Already verified: `409 EmailAlreadyVerifiedError`.

Response: `{"message": "Verification email sent"}`

### Forgot password

`POST /auth/forgot-password` · `200` · Public

Emails a reset link if the account exists. The answer is always the same, so it never reveals which emails have accounts.

Request:

```json
{
  "email": "string"
}
```

Response: `{"message": "If an account with this email exists, a reset link is on its way"}`

### Reset password

`POST /auth/reset-password` · `200` · Public

The web page behind the emailed link (`{FRONTEND_URL}/reset-password?token=...`) sends the token with the new password. The link works once, for 1 hour, and the reset signs out every session: log in again afterwards. A bad, used or expired link: `400 InvalidAccountTokenError`.

Request:

```json
{
  "token": "string (from the link)",
  "new_password": "string (min 6)"
}
```

Response: `{"message": "Password changed; please sign in again"}`

### Change password

`POST /auth/change-password` · `200` · Logged-in

For a settings screen. Every other device is signed out; this one gets new tokens, so replace the stored ones. A wrong current password: `400 CurrentPasswordIncorrectError`.

Request:

```json
{
  "current_password": "string",
  "new_password": "string (min 6)"
}
```

Response: `Tokens` (same as log in)

## Events

`Event`

```json
{
  "id": "int",
  "organizer_id": "int",
  "title": "string",
  "description": "string | null",
  "start_time": "datetime",
  "end_time": "datetime",
  "status": "draft | published | cancelled",
  "category": "string | null",
  "venue_name": "string | null",
  "venue_address": "string | null",
  "capacity": "int | null",
  "visibility": "public | unlisted | private",
  "registration_opens_at": "datetime | null",
  "registration_closes_at": "datetime | null",
  "refund_policy": "string | null",
  "image_url": "string | null",
  "suspended_at": "datetime | null (set when a platform admin suspends the event)",
  "suspension_reason": "string | null",
  "lifecycle": "draft | upcoming | active | completed | cancelled",
  "organizer_name": "string | null (display name, else the verified legal name)",
  "published_at": "datetime | null (first time it was published)",
  "cancelled_at": "datetime | null"
}
```

### List public events

`GET /events` · `200` · Public

Published, public events, soonest first. All query parameters are optional and combine.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `q` | string, max 100 | Text in the title, description, venue name or address. Not case-sensitive |
| `category` | string | Exact category, not case-sensitive |
| `date_from` | datetime | Starts at or after this moment |
| `date_to` | datetime | Starts before this moment |
| `include_past` | bool, default `false` | Also show events that have ended |
| `limit` | int 1-100, default 20 | Page size |
| `offset` | int, default 0 | How many to skip |

Example: `GET /events?q=jazz&category=music&limit=20&offset=0`

Response: `EventPage`, where `total` counts every match, not just this page:

```json
{
  "items": "EventListItem[]",
  "total": "int"
}
```

`EventListItem` is an `Event` plus two numbers for the card:

```json
{
  "min_price": "int | null (cheapest visible ticket type, 0 = free; null = no ticket types yet)",
  "tickets_remaining": "int | null (left across visible types, capped by capacity; null = no ticket types)"
}
```

### List categories

`GET /events/categories` · `200` · Public

Categories of upcoming public events, for a filter dropdown.

Response: `string[]`, e.g. `["Music", "Sport"]`

### Get one event

`GET /events/{event_id}` · `200` · Public

Published events, and also a cancelled event that was once published, so people with tickets or old links see "this event was cancelled" (`status: cancelled`, `cancelled_at`). Drafts, private and suspended events, and events cancelled before they were ever published, answer 404.

Response: `Event`

### List my events

`GET /events/me` · `200` · Approved organizer

Response: `Event[]`

Optional `?lifecycle=draft|upcoming|active|completed|cancelled` filters the list.

### My events with numbers

`GET /events/me/summary` · `200` · Approved organizer

The organizer's home page in one request, newest start first. Response: array of

```json
{
  "event_id": "int",
  "title": "string",
  "status": "draft | published | cancelled",
  "lifecycle": "draft | upcoming | active | completed | cancelled",
  "start_time": "datetime",
  "end_time": "datetime",
  "image_url": "string | null",
  "capacity": "int | null",
  "tickets_sold": "int (valid and checked-in tickets)",
  "revenue": "int (paid orders that stay paid, after discounts)",
  "paid_sales_status": "not_started | pending | active | suspended"
}
```

### Preview one of my events

`GET /events/{event_id}/manage` · `200` · Event organizer

The organizer's view of one event in any status, drafts and private events included. Use it to preview a draft before publishing; the public `GET /events/{event_id}` answers 404 for drafts.

Response: `Event`

### Create an event

`POST /events` · `200` · Approved organizer

Request:

```json
{
  "title": "string",
  "start_time": "datetime",
  "end_time": "datetime",
  "description": "string?",
  "category": "string?",
  "venue_name": "string?",
  "venue_address": "string?",
  "capacity": "int? (min 1)",
  "visibility": "public | unlisted | private ? (default public)",
  "registration_opens_at": "datetime?",
  "registration_closes_at": "datetime?",
  "refund_policy": "string? (max 2000)"
}
```

Response: `Event`

### Update an event

`PATCH /events/{event_id}` · `200` · Event organizer

Request: the same fields as create, all optional. Send only what changes. null clears an optional field (category, venue on a draft, capacity, registration dates, refund\_policy); title, start\_time, end\_time and visibility refuse null (422).

A cancelled event can't be edited: `409 InvalidEventStatusError` (duplicate it instead).

Response: `Event`

### Publish an event

`PATCH /events/{event_id}/publish` · `200` · Event organizer

Needs `venue_name` and `venue_address`.

Response: `Event`

### Unpublish an event

`PATCH /events/{event_id}/unpublish` · `200` · Event organizer

Only while no tickets are sold or held. Otherwise `409 EventHasTicketsError`: cancel the event instead (that refunds and notifies everyone).

Response: `Event`

### Cancel an event

`PATCH /events/{event_id}/cancel` · `200` · Event organizer

Can't be undone. Refunds paid orders and cancels the rest. An event that has already ended can't be cancelled: `409 EventAlreadyEndedError`.

Response: `Event`

### Upload a cover image

`PUT /events/{event_id}/image` · `200` · Event organizer

Send a `multipart/form-data` body with the file in a field named `file`: JPEG, PNG or WebP, at most 5 MB. It replaces any earlier image, and works for drafts too. The server checks the file's content, not its name, so a renamed file is refused. Errors: `415` wrong type, `413` too big, `503` storage unavailable.

```javascript
// web
const form = new FormData();
form.append("file", input.files[0]);

// React Native
form.append("file", { uri: photo.uri, name: "cover.jpg", type: "image/jpeg" });

fetch(`${API}/events/${id}/image`, { method: "PUT", body: form, headers: { Authorization: `Bearer ${token}` } });
// don't set Content-Type yourself: fetch adds it with the boundary
```

Response: `Event`, with the new `image_url`. Load the image straight from that URL; it needs no token.

### Remove the cover image

`DELETE /events/{event_id}/image` · `200` · Event organizer

Removing when there's no image is fine and changes nothing.

Response: `Event`, with `image_url: null`

### Duplicate an event

`POST /events/{event_id}/duplicate` · `201` · Event organizer

A new draft with the same details and ticket types (hidden ones stay hidden). Orders, sales, staff, promo codes and paid-sales activation are not copied. The cover image is copied. Works for cancelled events too.

Request (optional; send nothing to keep the title and dates):

```json
{
  "title?": "string",
  "start_time?": "datetime (moves every date of the copy by the same amount)"
}
```

Response: `Event`, the new draft

### Event history

`GET /events/{event_id}/history` · `200` · Event organizer

The activity timeline: every change, sale, refund and check-in, newest first. Platform admins can read it too. All parameters optional: `type` (the part before the dot: `event`, `ticket_type`, `order`, `ticket`, `campaign`, `staff`, `paid_sales`), `action` (one exact action, e.g. `order.refunded`), `date_from`, `date_to`, `limit` (1-200, default 50), `offset`.

Response:

```json
{
  "items": [
    {
      "id": "int",
      "created_at": "datetime",
      "action": "string, e.g. order.paid",
      "type": "string, e.g. order",
      "entity_type": "string",
      "entity_id": "int | null",
      "description": "string, ready to show",
      "actor_user_id": "int | null",
      "actor_email": "string | null (null = done automatically, e.g. an expired checkout)"
    }
  ],
  "total": "int"
}
```

### Organizer analytics

`GET /events/{event_id}/analytics` · `200` · Event organizer

All parameters optional: `date_from`, `date_to` (sales in that period), `ticket_type_id` (ticket numbers for one type). Capacity and check-ins are always "right now". Without filters, `money` equals `GET /events/{event_id}/sales`.

Response:

```json
{
  "event_id": "int",
  "currency": "KZT",
  "is_simulated": "boolean",
  "filters": { "date_from": "datetime | null", "date_to": "datetime | null", "ticket_type_id": "int | null" },
  "capacity": { "capacity": "int | null", "sold": "int", "held": "int", "remaining": "int | null", "percent_sold": "float | null" },
  "money": { "gross": "int", "discounts": "int", "refunds": "int", "processing_fees": "int", "net": "int", "paid_orders": "int" },
  "check_in": { "tickets": "int", "checked_in": "int", "absent": "int", "percent": "float | null" },
  "sales_over_time": [ { "date": "YYYY-MM-DD (Kazakhstan time)", "orders": "int", "tickets": "int", "revenue": "int" } ],
  "ticket_types": [ { "ticket_type_id": "int", "name": "string", "price": "int", "quantity": "int", "sold": "int", "revenue": "int", "held": "int", "checked_in": "int" } ],
  "campaigns": [ { "campaign_id": "int", "code": "string", "name": "string", "is_active": "boolean", "link_opens": "int", "orders": "int", "tickets": "int", "gross": "int", "discount": "int", "net": "int" } ]
}
```

`sales_over_time` is ready for a line or bar chart. Percentages have one decimal and are `null` when there is nothing to divide by.

### Report an event

`POST /events/{event_id}/reports` · `201` · Logged-in

Any signed-in user can report an event they can see; platform admins review the reports. One report per user per event: a second one answers `409 EventAlreadyReportedError`.

Request:

```json
{
  "reason": "fraud | inappropriate | misleading | spam | other",
  "details?": "string (max 2000)"
}
```

Response: `EventReport` (see Platform admin)

## Ticket types

`TicketType`

```json
{
  "id": "int",
  "event_id": "int",
  "name": "string",
  "description": "string | null",
  "price": "int",
  "quantity": "int",
  "sales_start": "datetime",
  "sales_end": "datetime",
  "is_hidden": "boolean",
  "max_per_order": "int",
  "sold_count": "int"
}
```

Both lists below add what the buy screen needs, worked out with the same rules as ordering. Seats held by checkouts still being paid count as taken.

```json
{
  "available": "int (left of this type, capped by what's left of the event's capacity)",
  "max_now": "int (how many one order may take now; 0 when it can't be bought)",
  "on_sale": "boolean",
  "unavailable_reason": "registration_closed | hidden | not_started | ended | paid_sales_inactive | sold_out | null"
}
```

`registration_closed` covers a draft, cancelled, private or suspended event and the registration window. Use `max_now` as the quantity picker's maximum.

### List an event's ticket types

`GET /events/{event_id}/ticket-types` · `200` · Public

Follows the public event page: published events, and once-public cancelled ones (every type `registration_closed`). Drafts and private events answer 404. Hidden types aren't listed.

Response: `TicketType[]` with availability

### List all ticket types (organizer)

`GET /events/{event_id}/ticket-types/manage` · `200` · Event organizer

For the organizer's edit screens: includes hidden types (`is_hidden: true`), and works for drafts and cancelled events. Oldest first.

Response: `TicketType[]` with availability

On a cancelled event, creating, updating, hiding and unhiding ticket types answer `409 InvalidEventStatusError`.

### Create a ticket type

`POST /events/{event_id}/ticket-type` · `201` · Event organizer

Request:

```json
{
  "name": "string",
  "price": "int (min 0, 0 = free)",
  "quantity": "int (min 1)",
  "sales_start": "datetime",
  "sales_end": "datetime",
  "description": "string?",
  "max_per_order": "int? (min 1, default 10)"
}
```

Response: `TicketType`

### Update a ticket type

`PATCH /ticket-types/{ticket_type_id}` · `200` · Event organizer

Request: the same fields as create, all optional. Send only what changes. `null` clears the description; every other field refuses `null` (422).

Response: `TicketType`

### Hide a ticket type

`PATCH /ticket_types/{ticket_type_id}/hide` · `200` · Event organizer

Response: `TicketType`

### Unhide a ticket type

`PATCH /ticket_types/{ticket_type_id}/unhide` · `200` · Event organizer

Response: `TicketType`

## Orders and tickets

`Order`

```json
{
  "id": "int",
  "event_id": "int",
  "status": "pending | confirmed | cancelled | refunded | expired",
  "total_amount": "int (what the buyer pays, after any discount)",
  "discount_amount": "int",
  "promo_code": "string | null",
  "buyer_name": "string",
  "buyer_email": "string",
  "created_at": "datetime",
  "expires_at": "datetime | null",
  "paid_at": "datetime | null",
  "cancelled_at": "datetime | null",
  "refunded_at": "datetime | null",
  "items": "OrderItem[]",
  "tickets": "Ticket[]",
  "event": "OrderEvent"
}
```

`OrderEvent`: enough to show the order without another request, even after the event is cancelled or suspended.

```json
{
  "id": "int",
  "title": "string",
  "start_time": "datetime",
  "end_time": "datetime",
  "venue_name": "string | null",
  "venue_address": "string | null",
  "status": "draft | published | cancelled",
  "image_url": "string | null",
  "cancelled_at": "datetime | null"
}
```

`OrderItem`

```json
{
  "id": "int",
  "ticket_type_id": "int",
  "quantity": "int",
  "unit_price": "int"
}
```

`Ticket`

```json
{
  "id": "int",
  "code": "string (the QR code content)",
  "ticket_type_id": "int",
  "event_id": "int",
  "attendee_name": "string",
  "status": "valid | checked_in | cancelled | refunded",
  "created_at": "datetime",
  "checked_in_at": "datetime | null"
}
```

### Create an order

`POST /events/{event_id}/orders` · `201` · Logged-in user

All free: `confirmed`, with tickets. Any paid ticket: `pending`, no tickets, and must be paid before `expires_at`.

Request:

```json
{
  "buyer_name": "string (1-200)",
  "items": [
    {
      "ticket_type_id": "int",
      "quantity": "int (min 1)",
      "attendee_names?": "string[] (one per ticket, printed on it; missing ones use buyer_name)"
    }
  ],
  "promo_code?": "string (not case-sensitive)"
}
```

Response: `Order`

### Preview a checkout

`POST /events/{event_id}/orders/preview` · `200` · Logged-in

The price before ordering, with a promo code if given. Same checks as a real order; nothing is reserved.

Request:

```json
{
  "items": [ { "ticket_type_id": "int", "quantity": "int (min 1)" } ],
  "promo_code?": "string"
}
```

Response:

```json
{
  "subtotal": "int",
  "discount": "int",
  "total": "int",
  "promo_code": "string | null"
}
```

Promo errors: `404 PromoCodeNotFoundError`, `409 PromoCodeNotActiveError`, `409 PromoCodeUsedUpError`, `409 PromoCodeNotApplicableError`. A discount that covers the whole price makes the order free: it is confirmed at once, with tickets.

### Pay for an order

`POST /orders/{order_id}/pay` · `200` · Buyer

Send `{}` for a successful payment. A declined payment returns `402`, and the order can be paid again.

Request:

```json
{
  "simulate_outcome": "success | failure ? (default success)"
}
```

Response: `Order`, with `tickets`

### List my orders

`GET /orders/me` · `200` · Logged-in user

Response: `Order[]`

### Get one order

`GET /orders/{order_id}` · `200` · Buyer

Response: `Order`

### Cancel an order

`POST /orders/{order_id}/cancel` · `200` · Buyer or event organizer

Pending and free orders only. A free registration can't be cancelled once any of its tickets was scanned or the event has ended (`409 OrderNotCancellableError`). Send `{}` if there's no reason.

Request:

```json
{
  "reason": "string? (max 500)"
}
```

Response: `Order`

### Refund an order

`POST /orders/{order_id}/refund` · `200` · Event organizer

Paid, confirmed orders only.

Request:

```json
{
  "reason": "string (3-500)"
}
```

Response: `Order`

### Get a ticket's QR image

`GET /tickets/{ticket_id}/qr` · `200` · Buyer

Response: PNG image (`image/png`)

### Download a ticket as PDF

`GET /tickets/{ticket_id}/pdf` · `200` · Buyer

A printable A4 page with the event, date and time (Kazakhstan time), venue, ticket type, price paid, attendee and QR code. Response: the PDF file (`application/pdf`). Cancelled and refunded tickets answer `409 TicketNotPrintableError`.

### Download an order's tickets as PDF

`GET /orders/{order_id}/pdf` · `200` · Buyer

Every valid ticket of the order, one page each. A checkout that isn't paid yet, or a cancelled or refunded order, answers `409 TicketNotPrintableError`.

Web: fetch with the `Authorization` header, then open the blob. Mobile: download to a file, then open the share sheet.

### List an event's attendees

`GET /events/{event_id}/attendees` · `200` · Event organizer

Response: array of

```json
{
  "ticket_id": "int",
  "attendee_name": "string",
  "ticket_type_name": "string",
  "status": "valid | checked_in | cancelled | refunded",
  "order_id": "int",
  "buyer_email": "string",
  "created_at": "datetime",
  "checked_in_at": "datetime | null",
  "checked_in_by": "string | null (email of the staff member who scanned it)"
}
```

### List an event's orders

`GET /events/{event_id}/orders` · `200` · Event organizer

Every order with its money, payment reference and refund details, newest first. All parameters optional: `status` (`pending`, `confirmed`, `cancelled`, `refunded`, `expired`), `q` (buyer name or email), `limit` (1-200, default 50), `offset`.

Response:

```json
{
  "items": [
    {
      "id": "int",
      "status": "pending | confirmed | cancelled | refunded | expired",
      "buyer_name": "string",
      "buyer_email": "string",
      "created_at": "datetime",
      "paid_at": "datetime | null",
      "cancelled_at": "datetime | null",
      "refunded_at": "datetime | null",
      "total_amount": "int (after any discount)",
      "discount_amount": "int",
      "promo_code": "string | null",
      "processing_fee": "int",
      "tickets": "int",
      "payment_reference": "string | null (SIM-...; null for free or unpaid orders)",
      "refund": { "amount": "int", "reason": "string | null", "provider_reference": "string (SIM-R-...)", "created_at": "datetime" },
      "is_simulated": "boolean (always true: demonstration payments, never real money)"
    }
  ],
  "total": "int"
}
```

`refund` is `null` unless the order was refunded.

### Get an event's sales summary

`GET /events/{event_id}/sales` · `200` · Event organizer

Response:

```json
{
  "event_id": "int",
  "currency": "string",
  "is_simulated": "boolean",
  "gross_sales": "int",
  "processing_fees": "int",
  "refunds": "int",
  "discounts": "int",
  "estimated_payout": "int",
  "paid_orders": "int",
  "ticket_types": [
    {
      "ticket_type_id": "int",
      "name": "string",
      "price": "int",
      "quantity": "int",
      "sold": "int",
      "reserved": "int",
      "available": "int",
      "refunded": "int",
      "checked_in": "int"
    }
  ]
}
```

## Scanning

"Staff" means staff assigned to the event, or its organizer.

`ScanTicket`

```json
{
  "id": "int",
  "code": "string",
  "attendee_name": "string",
  "ticket_type_name": "string",
  "status": "valid | checked_in | cancelled | refunded",
  "checked_in_at": "datetime | null",
  "checked_in_by": "string | null (email of the staff member who scanned it)"
}
```

For `already_checked_in`, show "Already scanned at {checked_in_at} by {checked_in_by}".

### List events I can scan for

`GET /staff/events` · `200` · Logged-in user

Response: `Event[]`

### Scan a ticket

`POST /events/{event_id}/check-in` · `200` · Staff

Every scan returns `200`. Only `checked_in` means let the person in.

Request:

```json
{
  "code": "string (text from the QR)"
}
```

Response:

```json
{
  "result": "checked_in | already_checked_in | invalid | wrong_event | cancelled | refunded | event_cancelled",
  "message": "string",
  "ticket": "ScanTicket | null"
}
```

### Undo a check-in

`POST /events/{event_id}/check-in/undo` · `200` · Staff

Request:

```json
{
  "ticket_id": "int"
}
```

Response: `ScanTicket`

### Search tickets

`GET /events/{event_id}/check-in/search?q={text}` · `200` · Staff

`q` is 2-100 characters and matches a name, an email or an exact code. Returns 20 at most.

Response: `ScanTicket[]`

### Get check-in counts

`GET /events/{event_id}/check-in/stats` · `200` · Staff

Response:

```json
{
  "registered": "int",
  "checked_in": "int",
  "not_checked_in": "int",
  "cancelled": "int",
  "refunded": "int"
}
```

## Event staff

`Staff`

```json
{
  "user_id": "int",
  "email": "string",
  "created_at": "datetime"
}
```

### Assign staff

`POST /events/{event_id}/staff` · `201` · Event organizer

The person must already have an account.

Request:

```json
{
  "email": "string (email)"
}
```

Response: `Staff`

### List staff

`GET /events/{event_id}/staff` · `200` · Event organizer

Response: `Staff[]`

### Remove staff

`DELETE /events/{event_id}/staff/{user_id}` · `204` · Event organizer

Response: no body

## Organizer profile

`OrganizerProfile`

```json
{
  "id": "int",
  "user_id": "int",
  "status": "pending | approved | rejected",
  "display_name": "string | null (shown to attendees; falls back to legal_name)",
  "rejection_reason": "string | null",
  "legal_name": "string | null",
  "contact_phone": "string | null",
  "identity_verified_at": "datetime | null",
  "payout_account": {
    "holder_name": "string",
    "bank_name": "string",
    "iban_last4": "string",
    "is_simulated": "boolean"
  }
}
```

`payout_account` is `null` until one is added.

### Apply to become an organizer

`POST /organizers/apply` · `200` · Logged-in user

The body is optional. A rejected applicant calls it again to go back to `pending` (the reason is cleared). Already pending or approved: `409 OrganizerProfileAlreadyExistsError`.

Request:

```json
{
  "display_name": "string? (2-100)"
}
```

Response: `Organizer`

```json
{
  "id": "int",
  "user_id": "int",
  "status": "pending | approved | rejected",
  "display_name": "string | null",
  "rejection_reason": "string | null"
}
```

### Set the public name

`PATCH /organizers/me` · `200` · Applicant or organizer

Request: `{"display_name": "string (2-100) | null"}`. `null` clears it, and event pages then show the verified legal name.

Response: `OrganizerProfile`

### Get my organizer profile

`GET /organizers/me` · `200` · Applicant or organizer

Response: `OrganizerProfile`

### Verify identity

`POST /organizers/me/verification` · `200` · Approved organizer

Request:

```json
{
  "legal_name": "string (2-200)",
  "contact_phone": "string (+7 701 123 45 67)"
}
```

Response: `OrganizerProfile`

### Set the payout account

`PUT /organizers/me/payout-account` · `200` · Approved organizer

Request:

```json
{
  "holder_name": "string (2-200)",
  "bank_name": "string (2-100)",
  "iban": "string (KZ86 125K ZT50 0410 0100)"
}
```

Response: `OrganizerProfile`

## Paid sales activation

An event can't sell paid tickets until this checklist is done and activated.

`PaidSalesStatus`

```json
{
  "event_id": "int",
  "status": "not_started | pending | active | suspended",
  "fee_amount": "int",
  "currency": "string",
  "is_simulated": "boolean",
  "checklist": {
    "has_paid_ticket_type": "boolean",
    "identity_verified": "boolean",
    "payout_account_connected": "boolean",
    "terms_accepted": "boolean",
    "fee_paid": "boolean"
  },
  "can_activate": "boolean",
  "activated_at": "datetime | null",
  "suspended_at": "datetime | null",
  "suspension_reason": "string | null"
}
```

### Get the checklist

`GET /events/{event_id}/paid-sales` · `200` · Event organizer

Response: `PaidSalesStatus`

### Accept the terms

`POST /events/{event_id}/paid-sales/accept-terms` · `200` · Event organizer

Response: `PaidSalesStatus`

### Pay the activation fee

`POST /events/{event_id}/paid-sales/pay-fee` · `200` · Event organizer

Send `{}` for a successful payment.

Request:

```json
{
  "simulate_outcome": "success | failure ? (default success)"
}
```

Response:

```json
{
  "id": "int",
  "purpose": "string",
  "amount": "int",
  "currency": "string",
  "status": "string",
  "provider": "string",
  "provider_reference": "string",
  "is_simulated": "boolean",
  "created_at": "datetime"
}
```

### Activate paid sales

`POST /events/{event_id}/paid-sales/activate` · `200` · Event organizer

Response: `PaidSalesStatus`

## Promo codes and Campaign QR

All organizer endpoints here are for the event organizer only. Attendees use a code by sending `promo_code` with the order.

`Campaign`

```json
{
  "id": "int",
  "event_id": "int",
  "name": "string",
  "code": "string (capitals)",
  "discount_type": "percent | fixed",
  "discount_value": "int (percent: 1-100; fixed: KZT off the order)",
  "starts_at": "datetime | null",
  "ends_at": "datetime | null",
  "max_redemptions": "int | null (null = unlimited)",
  "redemptions_count": "int (paid orders plus checkouts still being paid)",
  "is_active": "boolean",
  "link": "string (what the Campaign QR contains)",
  "link_opens": "int",
  "ticket_type_ids": "int[] (empty = every paid ticket type)",
  "created_at": "datetime",
  "stats": { "orders": "int", "tickets": "int", "gross": "int", "discount": "int", "net": "int" }
}
```

### Create a promo code

`POST /events/{event_id}/campaigns` · `201` · Event organizer

Request:

```json
{
  "name": "string (1-200)",
  "code?": "string (3-32 letters, digits or -; random 8 characters if left out)",
  "discount_type": "percent | fixed",
  "discount_value": "int (min 1; percent max 100)",
  "starts_at?": "datetime",
  "ends_at?": "datetime",
  "max_redemptions?": "int (min 1)",
  "ticket_type_ids?": "int[] (paid types of this event)"
}
```

Response: `Campaign`. A code already used at this event: `409 PromoCodeAlreadyExistsError`.

### List an event's promo codes

`GET /events/{event_id}/campaigns` · `200` · Event organizer

Response: `Campaign[]`

### Get one promo code

`GET /campaigns/{campaign_id}` · `200` · Event organizer

Response: `Campaign`

### Update a promo code

`PATCH /campaigns/{campaign_id}` · `200` · Event organizer

Only `name`, `starts_at`, `ends_at`, `max_redemptions` and `is_active` can change; `null` clears a date or the limit. The code, the discount and the ticket types are fixed: switch the code off and create a new one. The limit can't go below `redemptions_count` (`400 InvalidCampaignError`).

Response: `Campaign`

### Get the Campaign QR

`GET /campaigns/{campaign_id}/qr` · `200` · Event organizer

Response: a PNG image, for posters and flyers: navy code in an orange frame, captioned "PROMO CODE \<code> / NOT AN ENTRY TICKET", so nobody mistakes it for a ticket. It contains `link`: the event page with an opaque `?campaign=C-...` token, never the code or the discount.

### Open a Campaign QR link

`GET /campaign-links/{token}` · `200` · Public

Call it when the event page opens with `?campaign=`. It counts the open. Pre-fill `promo_code` at checkout when it isn't null; when it is null (the code is switched off, ended or used up), just show the event.

Response:

```json
{
  "event_id": "int",
  "promo_code": "string | null",
  "discount_type": "percent | fixed | null",
  "discount_value": "int | null"
}
```

Unknown token, or a private or draft event: `404 CampaignLinkNotFoundError`.

## Support cases

A support case is a chat-like thread. **Attendee cases** are about an event, order or ticket and are handled by that event's organizer. **Platform cases** are opened by organizers and handled by platform admins, who can also read every case. Everyone else gets `404 SupportCaseNotFoundError`. There is no live push: refresh the case (poll `GET /support/cases/{case_id}`) to see new messages.

`SupportCase`

```json
{
  "id": "int",
  "kind": "attendee | platform",
  "category": "string",
  "subject": "string",
  "status": "open | in_progress | waiting_for_customer | resolved",
  "requester_user_id": "int",
  "event_id": "int | null",
  "order_id": "int | null",
  "ticket_id": "int | null",
  "assigned_user_id": "int | null",
  "created_at": "datetime",
  "updated_at": "datetime",
  "messages": [
    { "id": "int", "author_user_id": "int | null", "body": "string", "created_at": "datetime" }
  ]
}
```

Lists return the same object without `messages`.

### Open a case

`POST /support/cases` · `201` · Logged-in

- `kind: attendee`: send exactly one of `event_id`, `order_id` or `ticket_id`, the most specific one the page has. The server fills in the rest and checks that the order or ticket is yours. Categories: `ticket_delivery`, `payment`, `refund`, `seating`, `event_information`, `check_in`, `account`, `technical`.
- `kind: platform`: organizers only, optionally about one of their own events (`event_id`). Categories: `account`, `activation`, `payment`, `technical`.

Request:

```json
{
  "kind": "attendee | platform",
  "category": "string (see above)",
  "subject": "string (1-200)",
  "message": "string (1-5000, the first message)",
  "event_id?": "int",
  "order_id?": "int",
  "ticket_id?": "int"
}
```

Response: `SupportCase`

### My cases

`GET /support/cases/me` · `200` · Logged-in

Cases I opened, recently updated first. Response: `SupportCase[]` (without messages)

### Inbox (cases I handle)

`GET /support/cases/inbox` · `200` · Approved organizer or platform admin

Organizers see attendee cases about their events; admins see all. Optional filters: `kind`, `status`. Anyone else: `403 SupportCaseAccessDeniedError`. Response: `SupportCase[]` (without messages)

### Get a case with its messages

`GET /support/cases/{case_id}` · `200` · Requester or handler

Response: `SupportCase` plus `history`, oldest first (messages stay in `messages`):

```json
{
  "history": [
    {
      "created_at": "datetime",
      "action": "status_changed | assigned",
      "actor_user_id": "int | null",
      "from_status": "string | null (status_changed only)",
      "to_status": "string | null",
      "assigned_user_id": "int | null (assigned only; null = unassigned)"
    }
  ]
}
```

### Reply

`POST /support/cases/{case_id}/messages` · `201` · Requester or handler

The other side gets an email. A requester's reply reopens a `waiting_for_customer` or `resolved` case.

Request: `{"body": "string (1-5000)"}`

Response: `{"id": "int", "author_user_id": "int", "body": "string", "created_at": "datetime"}`

### Change the status

`PATCH /support/cases/{case_id}/status` · `200` · Handler

The requester gets an email. The requester themselves can't change the status (`403 SupportCaseAccessDeniedError`).

Request: `{"status": "open | in_progress | waiting_for_customer | resolved"}`

Response: `SupportCase`

### Assign

`PATCH /support/cases/{case_id}/assignee` · `200` · Handler

`null` unassigns. The assignee must be a handler too (`400 InvalidSupportAssigneeError`) and gets an email.

Request: `{"user_id": "int | null"}`

Response: `SupportCase`

## Platform admin

`Settings`

```json
{
  "activation_fee_kzt": "int"
}
```

### Approve an organizer

`PATCH /organizers/{user_id}/approve` · `200` · Admin

Works on pending and rejected applications. Response: `Organizer`

### Reject an organizer

`POST /admin/organizers/{user_id}/reject` · `200` · Admin

Pending applications only (`409 InvalidOrganizerStatusError`). The user sees the reason in `/auth/me` and can apply again. An approved organizer is suspended instead.

Request: `{"reason": "string (3-500)"}`

Response: `Organizer`

### List paid sales activations

`GET /admin/paid-sales?status={status}` · `200` · Admin

`status` is optional: `pending`, `active` or `suspended`.

Response: array of

```json
{
  "event_id": "int",
  "event_title": "string",
  "status": "string",
  "fee_amount": "int | null",
  "fee_paid_at": "datetime | null",
  "activated_at": "datetime | null",
  "suspended_at": "datetime | null",
  "suspension_reason": "string | null"
}
```

### Suspend paid sales

`POST /admin/events/{event_id}/paid-sales/suspend` · `200` · Admin

Request:

```json
{
  "reason": "string (3-500)"
}
```

Response: `PaidSalesStatus`

### Reinstate paid sales

`POST /admin/events/{event_id}/paid-sales/reinstate` · `200` · Admin

Response: `PaidSalesStatus`

### Get settings

`GET /admin/settings` · `200` · Admin

Response: `Settings`

### Set the activation fee

`PUT /admin/settings/activation-fee` · `200` · Admin

Request:

```json
{
  "amount_kzt": "int (min 0)"
}
```

Response: `Settings`

### Search lists

All answer `{"items": [...], "total": int}`, newest first, with `limit` (1-200, default 50) and `offset`. A numeric `q` also matches the id. `?format=csv` downloads every matching row as a CSV file instead (UTF-8, opens correctly in Excel).

| Endpoint | Filters | Items |
| --- | --- | --- |
| `GET /admin/users` | `q` (email), `suspended` | `AdminUser` |
| `GET /admin/events` | `q` (title, venue), `status`, `suspended` | `Event` |
| `GET /admin/orders` | `q` (buyer email or name), `status`, `event_id` | `AdminOrder` |
| `GET /admin/payments` | `q` (reference), `status` (`succeeded`, `failed`: the failed-payment monitor), `purpose` (`order`, `activation_fee`), `event_id` | `AdminPayment` |
| `GET /admin/refunds` | `q` (reference, reason), `event_id` | `AdminRefund` |
| `GET /admin/campaigns` | `q` (code, campaign name, event title), `event_id`, `active` | `AdminCampaign` |
| `GET /admin/event-reports` | `status` (`open`, `dismissed`, `actioned`), `event_id` | `EventReport` |
| `GET /admin/organizers` | `q` (email, legal or display name, id or user id), `status` (`pending`, `approved`, `rejected`) | `AdminOrganizer` |
| `GET /admin/audit-log` | `type` (`event`, `order`, `organizer`, ...), `action` (`event.published`, ...), `actor_user_id`, `event_id`, `entity_type`, `entity_id`, `date_from`, `date_to` | `AuditEntry` |

```json
{
  "AdminUser": { "id": "int", "email": "string", "is_platform_admin": "boolean", "email_verified_at": "datetime | null", "suspended_at": "datetime | null", "suspension_reason": "string | null" },
  "AdminOrder": { "id": "int", "event_id": "int", "user_id": "int | null", "status": "string", "total_amount": "int", "processing_fee": "int", "buyer_name": "string", "buyer_email": "string", "created_at": "datetime", "paid_at": "datetime | null", "cancelled_at": "datetime | null", "refunded_at": "datetime | null" },
  "AdminPayment": { "id": "int", "purpose": "order | activation_fee", "amount": "int", "currency": "KZT", "status": "succeeded | failed", "is_simulated": "boolean", "provider_reference": "string", "failure_reason": "string | null", "payer_user_id": "int | null", "event_id": "int", "order_id": "int | null", "created_at": "datetime" },
  "AdminRefund": { "id": "int", "order_id": "int", "event_id": "int", "amount": "int", "currency": "KZT", "status": "string", "is_simulated": "boolean", "provider_reference": "string", "reason": "string | null", "initiated_by_user_id": "int | null", "created_at": "datetime" },
  "AdminCampaign": { "id": "int", "event_id": "int", "event_title": "string", "code": "string", "name": "string", "discount_type": "percent | fixed", "discount_value": "int", "is_active": "boolean", "max_redemptions": "int | null", "redemptions_count": "int", "link_opens": "int", "orders": "int", "tickets": "int", "gross": "int", "discount": "int", "net": "int", "created_at": "datetime" },
  "EventReport": { "id": "int", "event_id": "int", "reporter_user_id": "int", "reason": "string", "details": "string | null", "status": "open | dismissed | actioned", "reviewed_by_user_id": "int | null", "reviewed_at": "datetime | null", "review_note": "string | null", "created_at": "datetime" },
  "AdminOrganizer": { "id": "int", "user_id": "int", "email": "string", "status": "pending | approved | rejected", "display_name": "string | null", "legal_name": "string | null", "contact_phone": "string | null", "identity_verified_at": "datetime | null", "rejection_reason": "string | null" },
  "AuditEntry": { "id": "int", "created_at": "datetime", "action": "string", "type": "string", "entity_type": "string", "entity_id": "int | null", "event_id": "int | null", "description": "string", "actor_user_id": "int | null", "actor_email": "string | null" }
}
```

### Review an event report

`POST /admin/event-reports/{report_id}/review` · `200` · Admin

Request: `{"status": "dismissed | actioned", "note?": "string (max 2000)"}`. Suspending the event is a separate action.

Response: `EventReport`

### Suspend or unsuspend a user

`POST /admin/users/{user_id}/suspend` · `200` · Admin · and `POST /admin/users/{user_id}/unsuspend`

A suspended user is signed out everywhere and gets `403 UserSuspendedError` at login and on every request. Admins can't suspend themselves (`400 CannotSuspendSelfError`). Suspending an organizer's account doesn't touch their events: those keep selling and scanning. To stop an event, suspend the event too.

Request (suspend only): `{"reason": "string (3-500)"}`

Response: `AdminUser`

### Suspend or unsuspend an event

`POST /admin/events/{event_id}/suspend` · `200` · Admin · and `POST /admin/events/{event_id}/unsuspend`

A suspended event disappears from the public catalogue and event page (404), takes no new orders and no payments; the organizer still sees it, and tickets already issued still scan.

Request (suspend only): `{"reason": "string (3-500)"}`

Response: `Event`

### Health check

`GET /health` · `200` · Public

For the hosting platform. Response: `{"status": "ok", "database": "ok"}`; `503 DatabaseUnavailableError` when the database can't be reached.

## Errors

The error body:

```json
{
  "error": "string",
  "message": "string",
  "fields": "object | null"
}
```

For `422`, `error` is `VALIDATION_ERROR` and `fields` maps each field name to its problem.

Every error uses this body, including a missing or expired token (401), admin-only endpoints (403), unknown URLs (404 `NOT_FOUND`) and wrong methods (405 `METHOD_NOT_ALLOWED`). On `InvalidTokenError`, refresh the tokens and retry once; if the refresh fails, send the user to log in.

| Status | `error` values |
| --- | --- |
| `400` | `InvalidEventTimeError`, `InvalidTicketSalesTimeError`, `EventNotReadyToPublishError`, `InvalidOrderQuantityError`, `InvalidCampaignError`, `InvalidAccountTokenError` (bad, used or expired email link), `InvalidSupportAssigneeError`, `CannotSuspendSelfError`, `CurrentPasswordIncorrectError` |
| `401` | `InvalidCredentialsError`, `InvalidRefreshTokenError`, `NotAuthenticatedError` (no token sent), `InvalidTokenError` (bad or expired token, or a deleted account) |
| `402` | `PaymentFailedError` |
| `403` | `OrganizerNotApprovedError`, `EventAccessDeniedError`, `NotEventStaffError`, `PlatformAdminRequiredError`, `UserSuspendedError` (log the user out), `SupportCaseAccessDeniedError` |
| `404` | `UserNotFoundError`, `OrganizerNotFoundError`, `EventNotFoundError`, `TicketTypeNotFoundError`, `OrderNotFoundError`, `TicketNotFoundError`, `StaffAssignmentNotFoundError`, `PaidSalesNotFoundError`, `CampaignNotFoundError`, `PromoCodeNotFoundError`, `CampaignLinkNotFoundError`, `SupportCaseNotFoundError`, `EventReportNotFoundError`, `NOT_FOUND` (unknown URL) |
| `405` | `METHOD_NOT_ALLOWED` |
| `409` | `UserAlreadyExistsError`, `OrganizerProfileAlreadyExistsError`, `InvalidEventStatusError`, `RegistrationClosedError`, `TicketTypeNotAvailableError`, `TicketTypeSoldOutError`, `EventSoldOutError`, `QuantityBelowSoldError`, `StaffAlreadyAssignedError`, `TicketNotCheckedInError`, `PaidSalesNotActiveError`, `ActivationRequirementsNotMetError`, `ActivationFeeAlreadyPaidError`, `InvalidActivationStatusError`, `OrderNotPayableError` (also: the event was suspended), `OrderExpiredError`, `OrderNotCancellableError`, `OrderNotRefundableError`, `TicketNotPrintableError`, `PromoCodeAlreadyExistsError`, `PromoCodeNotActiveError`, `PromoCodeUsedUpError`, `PromoCodeNotApplicableError`, `EmailAlreadyVerifiedError`, `EventAlreadyReportedError`, `EventHasTicketsError` (unpublish with tickets sold), `EventAlreadyEndedError` (cancel after the end), `InvalidOrganizerStatusError` |
| `413` | `ImageTooLargeError` |
| `415` | `InvalidImageError` |
| `422` | `VALIDATION_ERROR` |
| `503` | `StorageNotConfiguredError`, `StorageUnavailableError`, `DatabaseUnavailableError` |
