"""The last MVP fixes from the full audit: safe CSV exports, suspended events in the reservation and payment,
admin promo-code activity, and emails in Kazakh, Russian and English."""
import csv
import io
import sys
import urllib.request
from urllib.parse import urlencode
from helpers import E2E, BASE
from database import SessionLocal
from repositories.event_repository import reserve_event_capacity
from services.email_service import EMAIL_TEMPLATES
from services.email_templates import render_email, DIVIDER

KAZAKH_LETTERS = set("әғқңөұүһі")


def raw_get(path: str, token: str):
    request = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.headers.get("Content-Type"), response.read().decode("utf-8-sig")


def main() -> bool:
    with E2E("MVP completion") as t:
        (org, _), (admin, _), (mallory, _), (bob, _) = (t.new_user(organizer=True), t.new_user(admin=True),
                                                        t.new_user(), t.new_user())
        eid = t.make_event(org, title="Audit Gala")
        paid = t.make_ticket_type(org, eid, name="Paid", price=10000)
        t.activate_paid_sales(org, eid)
        code = f"AUDIT{eid}"
        t.call("POST", f"/events/{eid}/campaigns", {"name": "Audit poster", "code": code, "discount_type": "percent",
                                                     "discount_value": 50}, org)

        # --- 1. CSV exports can't smuggle spreadsheet formulas ------------------------------------------------------
        evil = '=HYPERLINK("http://evil.example","click")'
        s, o = t.order(mallory, eid, [(paid, 1)], buyer_name=evil)
        kind, text = raw_get("/admin/orders?" + urlencode({"event_id": eid, "format": "csv"}), admin)
        cells = [cell for row in csv.reader(io.StringIO(text)) for cell in row]
        t.check("the formula is exported as text, with a leading '", "'" + evil in cells, f"{[c for c in cells if 'HYPERLINK' in c]}")
        t.check("no exported cell starts with = + - or @", not any(c[:1] in "=+-@" for c in cells if c))
        s, page = t.call("GET", "/admin/orders?" + urlencode({"event_id": eid}), token=admin)
        t.check("the JSON list still shows the real name", any(x["buyer_name"] == evil for x in page["items"]))

        # --- 2. suspended events: no new reservation, no payment ------------------------------------------------
        s, pending = t.order(bob, eid, [(paid, 1)])
        t.call("POST", f"/admin/events/{eid}/suspend", {"reason": "Audit check"}, admin)
        s, b = t.call("POST", f"/orders/{pending['id']}/pay", {}, bob)
        t.check("a checkout started before the suspension can't be paid", s == 409 and b["error"] == "OrderNotPayableError",
                f"{s} {b and b.get('error')}")
        db = SessionLocal()
        try:
            # the atomic reservation itself refuses, so a buyer racing the suspension can't slip through
            t.check("the reservation query refuses a suspended event", reserve_event_capacity(eid, 1, db) is None)
        finally:
            db.rollback()
            db.close()
        s, b = t.order(bob, eid, [(paid, 1)])
        t.check("a new order answers 404, like a hidden event", s == 404, f"status {s}")
        t.call("POST", f"/admin/events/{eid}/unsuspend", token=admin)

        # --- 5. platform admins see promo-code activity -----------------------------------------------------------
        s, promo = t.call("POST", f"/events/{eid}/orders", {"buyer_name": "Bob", "promo_code": code,
                                                            "items": [{"ticket_type_id": paid, "quantity": 2}]}, bob)
        t.call("POST", f"/orders/{promo['id']}/pay", {}, bob)
        s, page = t.call("GET", "/admin/campaigns?" + urlencode({"q": code}), token=admin)
        row = page["items"][0] if s == 200 and page["items"] else {}
        t.check("admin lists the campaign with its event and results", s == 200 and page["total"] == 1
                and (row.get("event_title"), row.get("orders"), row.get("tickets"), row.get("gross"), row.get("discount"),
                     row.get("net")) == ("Audit Gala", 1, 2, 20000, 10000, 10000), f"{s} {row}")
        s, page = t.call("GET", "/admin/campaigns?" + urlencode({"event_id": eid, "active": "false"}), token=admin)
        t.check("filter by active", s == 200 and page["total"] == 0, f"{s} {page and page.get('total')}")
        kind, text = raw_get("/admin/campaigns?" + urlencode({"q": code, "format": "csv"}), admin)
        t.check("CSV export", kind.startswith("text/csv") and code in text and "event_title" in text.splitlines()[0])
        s, _ = t.call("GET", "/admin/campaigns", token=org)
        t.check("organizers can't use it", s == 403, f"status {s}")

        # --- 6. every email in Kazakh, Russian and English ------------------------------------------------------------
        sample = {"token": "abc", "expires_at": "2026-12-01 10:00", "order_id": 7, "event_id": 3, "event_title": "Gala",
                  "amount": 5000, "reason": "Test", "changes": "Басталуы / Начало / Starts: 01.12.2026 19:00 (UTC+5)",
                  "status": "in_progress", "case_id": 9, "subject": "No QR"}
        problems = []
        for name in EMAIL_TEMPLATES:
            subject, body = render_email(name, sample)
            parts = body.split(DIVIDER)
            if len(parts) != 3:
                problems.append(f"{name}: {len(parts)} languages")
                continue
            kk, ru, en = parts
            if not KAZAKH_LETTERS & set(kk.lower()):
                problems.append(f"{name}: no Kazakh letters in the first part")
            if not any("а" <= ch <= "я" for ch in ru.lower()):
                problems.append(f"{name}: no Cyrillic in the second part")
            if any("а" <= ch <= "я" for ch in en.lower().replace("басталуы / начало / ", "")):
                problems.append(f"{name}: Cyrillic in the English part")
            if " | " not in subject:
                problems.append(f"{name}: subject isn't Kazakh | Russian")
        t.check(f"all {len(EMAIL_TEMPLATES)} emails come in Kazakh, Russian and English", not problems, f"{problems}")
        subject, body = render_email("support_case_status_changed", sample)
        t.check("support statuses are translated", "қаралуда" in body and "в работе" in body and "in_progress" in body)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
