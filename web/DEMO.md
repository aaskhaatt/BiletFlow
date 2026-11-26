# BiletFlow web: demo run instructions

How to start the web application with its backend and demo data on one computer, what to click in the demonstrated journey, what is simulated, and how to run the tests that prove it. Written for the release tag `v0.1-demo` (see "Release tag" at the end); the requirement-by-requirement evidence is in [`TRACEABILITY.md`](TRACEABILITY.md).

**Local demo only.** Nothing here needs a public server. Paths are from the repository root unless a command starts with `cd`.

## What you need

| Tool               | Version                                                         | Used for                                                                                      |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js (with npm) | 24 or newer                                                     | the web app and its tests                                                                     |
| Python             | 3.12                                                            | the backend API                                                                               |
| PostgreSQL         | 16 (the project uses 16 in Docker; a local 16 or 17 also works) | the database                                                                                  |
| Docker Desktop     | any recent                                                      | optional: the database, event image storage and a mail catcher come from `docker-compose.yml` |
| Google Chrome      | any recent                                                      | only for the browser tests (`npm run e2e`)                                                    |

The backend asks for a few settings before it starts; they are listed in `backend/.env.example`. Copy it to `backend/.env` and set your own `SECRET_KEY`.

## 1. Start the backend with demo data

Terminal 1, from the repository root:

```bash
docker compose up -d postgres            # the database (add "storage" for event cover images, "mailpit" to read emails)
cd backend
python3.12 -m venv .venv                 # first time only
source .venv/bin/activate
pip install -r requirements.txt          # first time only
cp .env.example .env                     # first time only; set your own SECRET_KEY
alembic upgrade head
python scripts/seed_demo.py              # demo accounts and four events (add --reset to start again)
uvicorn main:app --reload                # API on http://localhost:8000, documentation at /docs
```

Check: <http://localhost:8000/health> answers `{"status":"ok","database":"ok"}`.

The seed script prints the accounts at the end. It refuses a database that is not on this computer unless given `--allow-remote`, and `--clear` removes everything it created.

## 2. Start the web app

Terminal 2:

```bash
cd web
npm install                              # first time only
npm run dev                              # http://localhost:5173
```

Keep port **5173**: the backend lets browsers call it only from `http://localhost:5173` (its `CORS_ORIGINS`). The web finds the API through `VITE_API_URL`, `http://localhost:8000` by default (see `web/.env.example`). Open <http://localhost:5173>: the catalog shows the demo events.

Language: the switcher in the header offers Kazakh, Russian and English. The Kazakh texts were reviewed by the team on 2026-11-26.

## 3. Demo accounts

All accounts share one password: the value of `DEMO_PASSWORD` in `backend/scripts/seed_demo.py` (it is not copied here). Print it into a shell variable without showing it:

```bash
cd backend && source .venv/bin/activate
export DEMO_PASSWORD=$(python -c 'from scripts.seed_demo import DEMO_PASSWORD; print(DEMO_PASSWORD)')
```

| Role                                                        | Email                                                                                                                       | What it can do                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Platform admin                                              | `admin@demo.example.com`                                                                                                    | `/admin`: moderation, users, orders, payments, refunds, settings      |
| Organizer (approved, identity and payout set up)            | `organizer@demo.example.com`                                                                                                | `/organizer`: owns the four demo events                               |
| Event Admin (check-in staff of the meetup and the festival) | `staff@demo.example.com`                                                                                                    | scans tickets in the mobile app; in this demo through the API (below) |
| Attendees                                                   | `aigerim@`, `daniyar@`, `aliya@`, `timur@`, `madina@`, `yerlan@`, `dana@`, `arman@`, `saule@`, `nurlan@` `demo.example.com` | have tickets and orders of different states                           |

Demo events: #1 _Astana Jazz Night_ (paid, promo codes `JAZZ20` and `STUDENT`), #2 _Almaty Tech Meetup_ (free, happening now, 4 of 7 checked in), #3 _Nauryz Fest_ (completed), #4 _Summer Open Air_ (draft). You can also register a new attendee at `/register`.

## 4. The demonstrated journey

One journey from SRS section 13.4, then three failure cases. Everything runs through the real backend and database. The same journey is automated in `e2e/core-journey.spec.ts` (section 6), so you can rehearse it by hand and compare.

**Journey** (the seed's organizer creates a _new_ event, so the demo events stay as they are):

| #   | Who         | Where                               | Do                                                                                                                  | Expected result                                                                                                                                              |
| --- | ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Organizer   | `/organizer/events/new`             | Fill the name, capacity, start, end, venue and address; "Save draft"                                                | The event page opens with the status "Draft"                                                                                                                 |
| 2   | Organizer   | event page, "Ticket types"          | Add a free type ("Free entry", 0 ₸) and a paid one ("Standard", 5000 ₸); sales from a past time to before the start | Two rows in the ticket-type card                                                                                                                             |
| 3   | Organizer   | "Paid sales" card                   | "Read the terms" → accept; "Activation fee" → pay with "Successful payment"; "Activate paid sales"                  | "Paid sales are active." The checklist says 5 of 5 steps done. A **demo banner** says no real money is charged                                               |
| 4   | Organizer   | event page                          | "Publish"                                                                                                           | Status "Upcoming"; both types "On sale"                                                                                                                      |
| 5   | Organizer   | `/organizer/campaigns/new`          | Choose the event, name the campaign, 20 % off, a promo code, tick "Standard"; "Activate campaign"                   | The campaign page shows the **QR code** and its link (`…/events/<id>?campaign=C-…`) with "Link opens: 0"                                                     |
| 6   | Organizer   | event, "Event Admin" tab            | Assign `staff@demo.example.com`                                                                                     | The staff member appears in the list                                                                                                                         |
| 7   | Attendee    | `/register`, then the campaign link | Create an account, open the link from step 5                                                                        | The event page says that the promo code is applied ("… applied")                                                                                             |
| 8   | Attendee    | event page → checkout               | Add one Standard ticket; "Continue to checkout"; enter a name; accept the terms                                     | The total is **4,000 ₸** (5,000 − 20 %) and a demo banner is shown; "Reserve and continue to payment"                                                        |
| 9   | Attendee    | `/orders/<id>`                      | Choose "Declined payment", pay                                                                                      | **Failure case 1:** "The payment didn't go through." The order is still pending (the countdown runs), no ticket exists. Reload: the countdown is still there |
| 10  | Attendee    | same page                           | Choose "Successful payment", pay                                                                                    | "Your order is confirmed." One ticket with a **QR code** and a ticket code. Reload: the order is still there; it is also in "Orders"                         |
| 11  | Attendee    | order page                          | "Printable PDF" or "PDF of all tickets in this order"                                                               | A PDF downloads                                                                                                                                              |
| 12  | Attendee    | order page → "Contact support"      | Category "Payment", a subject and a message; "Send"                                                                 | The case opens with the order attached                                                                                                                       |
| 13  | Organizer   | `/organizer/support`                | Open the case, write a reply, "Send"                                                                                | The reply is in the thread                                                                                                                                   |
| 14  | Event Admin | scanner (API, see below)            | Scan the ticket code                                                                                                | `result: checked_in`, with the time and `checked_in_by: staff@demo.example.com`. Scanning the **campaign token** (`C-…`) gives `result: invalid`             |
| 15  | Event Admin | scanner (API)                       | Scan the same ticket code again                                                                                     | **Failure case 2:** `result: already_checked_in`, the same time; no second entry (the organizer's "Checked in" card stays at 1)                              |
| 16  | Organizer   | `/organizer/events/<id>/attendees`  | Look at the attendee row                                                                                            | Status "Checked in", the time and `staff@demo.example.com` in the "Check-in" column                                                                          |
| 17  | Organizer   | campaign page                       | Reload                                                                                                              | Results: 1 order, 1 ticket sold, 1,000 ₸ discounts, link opens ≥ 1                                                                                           |
| 18  | Attendee    | `/support/<id>`, `/tickets/<id>`    | Open both                                                                                                           | The organizer's reply is visible; the ticket says "Checked in" and shows no QR                                                                               |

**Scanning through the API.** The Event Admin's scanning app is a separate mobile app; here the same endpoint is called by hand. The staff member must be assigned to the event (step 6; the seed already assigned `staff@` to events #2 and #3).

```bash
API=http://localhost:8000
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"staff@demo.example.com\",\"password\":\"$DEMO_PASSWORD\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -s -X POST $API/events/<EVENT_ID>/check-in -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"code":"<TICKET_CODE>"}'
```

The ticket code is shown on the ticket and order pages (`T-…`).

**Failure case 3: an unpaid reservation expires.** The API holds tickets for `ORDER_HOLD_MINUTES` (10 by default). For a short demo start the API with a one-minute hold:

```bash
cd backend && source .venv/bin/activate
ORDER_HOLD_MINUTES=1 ORDER_SWEEP_INTERVAL_SECONDS=1 uvicorn main:app --reload
```

Reserve a paid ticket and do not pay. After a minute the order page says "Your reservation expired"; the payment button is gone; "Choose tickets again" links to the event; the ticket is on sale again.

## 5. What is simulated

- **Payments, refunds and the activation fee** are internal simulations (`provider = simulated`, references start with `SIM-`). The checkout, the order page, the order list, the organizer's sales and refunds screens, the analytics and the admin money lists carry the banner "Demo mode: no real money is charged". On the payment panel you choose whether the test payment succeeds or is declined.
- **Identity check and payout account** of an organizer are simulated: nothing is verified, and only the last four characters of the IBAN are stored.
- **Emails** are written to an outbox table and are not sent unless `SMTP_HOST` is set. For a demo, `docker compose up -d mailpit`, put `SMTP_HOST=localhost` in `backend/.env`, restart the API, and read the mails at <http://localhost:8025>. No test in this repository checks the emails.
- **Ticket scanning** is done through the API in this demo (see section 4); the mobile app is outside the web.
- **The campaign QR** is shown as an image and as a link; the demo opens the link instead of scanning the image with a camera.
- **Times** are shown in Astana time (UTC+5), whatever your computer's time zone.

## 6. Run the tests

From `web/`:

```bash
npm run typecheck && npm run lint && npm run format:check
npm test                                  # unit and component tests (Vitest)
npm run build                             # production build
npm run e2e                               # browser tests; tests that need the backend skip themselves unless their variable is set
```

**The live journey and the failure cases** (`e2e/core-journey.spec.ts`) need a **disposable** database, because they create users, events and orders. Never point them at the database you demo from.

```bash
# 1. a separate database, migrated and seeded (from backend/, venv active)
createdb biletflow_e2e                    # or CREATE DATABASE; give the same owner as your usual database
export DATABASE_URL=postgresql://<user>:<password>@localhost:5432/biletflow_e2e
alembic upgrade head && python scripts/seed_demo.py

# 2. a second API on port 8001 that holds tickets for one minute (same shell)
ORDER_HOLD_MINUTES=1 ORDER_SWEEP_INTERVAL_SECONDS=1 \
  CORS_ORIGINS=http://localhost:5173 uvicorn main:app --port 8001

# 3. the web tests (from web/, another shell; port 5173 must be free)
export VITE_API_URL=http://127.0.0.1:8001
export BILETFLOW_E2E_LIVE_JOURNEY=1
export BILETFLOW_E2E_SEED_PASSWORD=$DEMO_PASSWORD
npm run e2e -- e2e/core-journey.spec.ts
```

The journey test takes about ten seconds; the expiry test waits a minute. The expiry test skips itself when the API holds tickets for more than 150 seconds. The other live specs use the variables in `.github/workflows/web-session-tests.yml` (`BILETFLOW_E2E_LIVE_AUTH`, `…_CHECKOUT`, `…_PAID_SALES`, `…_OPERATIONS`, plus `BILETFLOW_E2E_ADMIN_PASSWORD`).

**If Chrome closes after about 30 seconds.** Some Chrome builds do that (it happened on the machine of these runs, also without Playwright), which breaks any test that waits longer, such as the expiry test. Install Playwright's own browser and run with `CI=1`, which makes the configuration use it instead of the installed Chrome (it also retries a failed test once and starts its own dev server, so stop yours on port 5173 first):

```bash
npx playwright install chromium
CI=1 npm run e2e -- e2e/core-journey.spec.ts
```

This was **not tried** with Playwright's current Chromium; the runs of this version used a cached older Chromium started by path.

**Screenshots for the backup.** Run the journey with `BILETFLOW_E2E_RECORD=1`: it slows the journey down and puts a caption on the screen with the step name and `BILETFLOW_E2E_LABEL` (write the version and the date there). `BILETFLOW_E2E_SHOT_DIR=<folder>` saves a screenshot of every key moment. Without these variables the test leaves no files and adds no pauses.

## 7. Backup of the demonstration

A presentation backup must be labelled with the version and the date. The backup made for this version is **outside the repository**, in `demo-recordings/` next to it:

- `biletflow-web-demo_5878d90-w15_2026-11-26_screenshots/`: 15 screenshots of the journey (including the entrance scan results) and of the expired reservation, each with a caption naming the step, the version `5878d90+W15` (main at `5878d90` plus the W14/W15 changes) and the date `2026-11-26`.
- **There is no video.** Playwright records video only with its own ffmpeg (`npx playwright install ffmpeg`) and a `video` setting in the configuration; neither is set up.

Before the presentation, record again from the tagged commit so that the label is the tag's commit.

## 8. Known limitations

- The Event Admin's mobile app is a separate app: this demo calls its scanning endpoint through the API instead of using the app.
- No assigned seating, no GA4, no full calendar export (only a minimal `.ics` download on the event page).
- One attendee name per order (not per ticket); no PDF of the campaign QR (PNG only).
- Long Kazakh and Russian strings were not checked on every screen.
- Not done from the quality list: long-string fit, contrast of status badges and the printed ticket, a state audit (loading, empty, error) of every screen, security hardening (there is no Content-Security-Policy: no nginx), build size and Lighthouse.
- The web app is not in Docker Compose; it runs with `npm run dev`.
- Admin screens were tested with mocked data and stubs, never against the real backend.
- The PDF ticket's content and its scanning from paper are not verified by any test.
- `e2e/ui-kit.spec.ts` ("mobile navigation, table, chart data, and skip link remain usable") fails intermittently when a real API is reachable at `VITE_API_URL`; it passes when the address is unreachable.
- `core-journey.spec.ts` is not yet in `web-session-tests.yml`, so CI does not run it.

## Release tag

Put the tag **after** the branch is merged and the checks above pass on the merged commit (otherwise the tag points at a commit that is not the one that was verified):

```bash
git switch main && git pull
git tag -a v0.1-demo -m "BiletFlow web demo: journey, failure cases, traceability and demo instructions"
git push origin v0.1-demo
```

Write the commit hash of the tag (`git rev-parse --short v0.1-demo`) in the report and on the slides.
