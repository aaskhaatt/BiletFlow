"""Shared tools for the end-to-end tests.

Each test starts a real API server on a spare port, talks to it over HTTP like the frontend would,
and deletes every user/event it created when it finishes, even if it crashes.
The tests use the database from backend/.env, so keep Postgres running.
"""
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402
from database import engine  # noqa: E402

PORT = int(os.getenv("E2E_PORT", "8011"))
BASE = f"http://127.0.0.1:{PORT}"
SERVER_LOG = Path(__file__).resolve().parent / "server.log"

NOW = datetime.now(timezone.utc)
EVENT_START = NOW + timedelta(days=7)
EVENT_END = EVENT_START + timedelta(hours=3)


def iso(moment: datetime) -> str:
    return moment.isoformat()


class E2E:
    """Use as `with E2E("orders") as t:`. Starts the server, tracks test data, cleans up, prints a summary."""

    def __init__(self, name: str):
        self.name = name
        self.results: list[bool] = []
        self.emails: list[str] = []
        self.event_ids: list[int] = []
        self.server = None

    # --- server lifecycle -------------------------------------------------------------------

    def __enter__(self):
        self._log = open(SERVER_LOG, "w")
        self.server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT), "--log-level", "warning"],
            cwd=BACKEND, stdout=subprocess.DEVNULL, stderr=self._log,
        )
        for _ in range(100):
            try:
                urllib.request.urlopen(BASE + "/openapi.json")
                break
            except Exception:
                if self.server.poll() is not None:
                    raise RuntimeError(f"test server failed to start, see {SERVER_LOG}")
                time.sleep(0.1)
        print(f"=== {self.name}")
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            with engine.begin() as c:
                if self.event_ids:
                    # audit rows only lose their event link (SET NULL), so delete them explicitly
                    c.execute(text("delete from audit_logs where event_id = any(:ids)"), {"ids": self.event_ids})
                # deleting the users cascades to their organizer profile, events, orders and tickets
                c.execute(text("delete from users where email = any(:emails)"), {"emails": self.emails})
        finally:
            self.server.terminate()
            self.server.wait()
            self._log.close()

        if exc_type is not None:
            print(f"CRASH {exc_type.__name__}: {exc}  (server errors are in {SERVER_LOG})")
            self.results.append(False)
        print(f"--- {self.name}: {sum(self.results)}/{len(self.results)} checks passed\n")
        return True  # the crash is reported as a failed check, so run_all.py keeps going

    @property
    def passed(self) -> bool:
        return bool(self.results) and all(self.results)

    # --- HTTP -------------------------------------------------------------------------------

    def call(self, method: str, path: str, body=None, token=None):
        """Returns (status, parsed JSON or None)."""
        status, _, raw = self.call_raw(method, path, body, token)
        return status, (json.loads(raw) if raw else None)

    def call_raw(self, method: str, path: str, body=None, token=None):
        """Returns (status, content type, raw bytes); for non-JSON responses like images."""
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(BASE + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status, response.headers.get("Content-Type"), response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers.get("Content-Type"), error.read()

    def check(self, name: str, ok, detail=""):
        self.results.append(bool(ok))
        print(f"{'PASS' if ok else 'FAIL'}  {name:<54} {detail}")

    # --- test data --------------------------------------------------------------------------

    def new_user(self, organizer: bool = False):
        """Registers and logs in a fresh user. Returns (access_token, email)."""
        email = f"e2e-{secrets.token_hex(4)}@example.com"
        self.emails.append(email)
        password = secrets.token_urlsafe(12)
        self.call("POST", "/auth/register", {"email": email, "password": password})
        _, tokens = self.call("POST", "/auth/login", {"email": email, "password": password})
        token = tokens["access_token"]

        if organizer:
            self.call("POST", "/organizers/apply", token=token)
            # approving needs a platform admin; tests approve directly in the database instead
            with engine.begin() as c:
                c.execute(text("update organizer_profiles set status = 'approved' "
                               "where user_id = (select id from users where email = :e)"), {"e": email})
        return token, email

    def make_event(self, org_token: str, publish: bool = True, **fields) -> int:
        body = {"title": "E2E event", "start_time": iso(EVENT_START), "end_time": iso(EVENT_END),
                "venue_name": "Barys Arena", "venue_address": "Astana, Turan Ave 57", **fields}
        _, event = self.call("POST", "/events", body, org_token)
        self.event_ids.append(event["id"])
        if publish:
            self.call("PATCH", f"/events/{event['id']}/publish", token=org_token)
        return event["id"]

    def make_ticket_type(self, org_token: str, event_id: int, name: str = "Standard", quantity: int = 10,
                         price: int = 0, max_per_order: int = 10, sales_start: datetime | None = None) -> int:
        body = {"name": name, "price": price, "quantity": quantity, "max_per_order": max_per_order,
                "sales_start": iso(sales_start or NOW - timedelta(days=1)), "sales_end": iso(EVENT_START)}
        _, ticket_type = self.call("POST", f"/events/{event_id}/ticket-type", body, org_token)
        return ticket_type["id"]

    def order(self, token: str, event_id: int, items: list[tuple[int, int]], buyer_name: str = "Aigerim Sadykova"):
        """items = [(ticket_type_id, quantity), ...]. Returns (status, body)."""
        body = {"buyer_name": buyer_name, "items": [{"ticket_type_id": t, "quantity": q} for t, q in items]}
        return self.call("POST", f"/events/{event_id}/orders", body, token)

    def db_value(self, sql: str, **params):
        with engine.connect() as c:
            return c.execute(text(sql), params).scalar()

    def db_rows(self, sql: str, **params):
        with engine.connect() as c:
            return c.execute(text(sql), params).all()
