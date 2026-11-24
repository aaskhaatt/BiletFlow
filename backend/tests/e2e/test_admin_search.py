"""Feature 13: admin search and monitoring lists with CSV export (SRS 4.12).

GET /admin/{users,events,orders,payments,refunds}: filters + `q` text search + limit/offset,
answering {items, total}. `?format=csv` exports every matching row instead.
"""
import csv
import io
import secrets
import sys
from urllib.parse import quote
from helpers import E2E


def main() -> bool:
    with E2E("admin search") as t:
        admin, _ = t.new_user(admin=True)
        nobody, nobody_email = t.new_user()
        org, _ = t.new_user(organizer=True)
        tag = secrets.token_hex(4)

        event_id = t.make_event(org, title=f"Search {tag} night")
        paid_type = t.make_ticket_type(org, event_id, name="Paid", price=5000)
        t.activate_paid_sales(org, event_id)
        _, order = t.order(nobody, event_id, [(paid_type, 1)], buyer_name="Айгерим Садыкова")
        t.call("POST", f"/orders/{order['id']}/pay", {"simulate_outcome": "failure"}, nobody)
        t.call("POST", f"/orders/{order['id']}/pay", {"simulate_outcome": "success"}, nobody)
        t.call("POST", f"/orders/{order['id']}/refund", {"reason": "Attendee can't come"}, org)

        def get(path):
            return t.call("GET", path, token=admin)

        # 1. only admins
        for path in ("/admin/users", "/admin/events", "/admin/orders", "/admin/payments", "/admin/refunds"):
            status, _ = t.call("GET", path, token=nobody)
            t.check(f"{path} is admin-only: 403", status == 403, status)

        # 2. users
        status, page = get(f"/admin/users?q={nobody_email.split('@')[0]}")
        t.check("users: search by email", status == 200 and [u["email"] for u in page["items"]] == [nobody_email]
                and page["total"] == 1, page)
        uid = page["items"][0]["id"]
        _, page = get(f"/admin/users?q={uid}")
        t.check("users: a number also matches the id", uid in [u["id"] for u in page["items"]])
        _, page = get("/admin/users?q=%25")
        t.check("users: % is a literal character, not a wildcard", page["total"] == 0, page["total"])
        t.call("POST", f"/admin/users/{uid}/suspend", {"reason": "Testing filters"}, admin)
        _, page = get("/admin/users?suspended=true&limit=200")
        t.check("users: filter by suspended", uid in [u["id"] for u in page["items"]]
                and all(u["suspended_at"] for u in page["items"]))
        _, all_users = get("/admin/users?limit=2")
        _, second = get("/admin/users?limit=2&offset=2")
        t.check("users: paging with limit/offset", len(all_users["items"]) == 2 and all_users["total"] >= 3
                and not {u["id"] for u in all_users["items"]} & {u["id"] for u in second["items"]},
                f"{all_users} / {second}")
        status, _ = get("/admin/users?limit=0")
        t.check("users: limit must be 1..200: 422", status == 422, status)

        # 3. events
        _, page = get(f"/admin/events?q={tag}")
        t.check("events: search by title", [e["id"] for e in page["items"]] == [event_id], page)
        _, page = get(f"/admin/events?q={tag}&status=draft")
        t.check("events: filter by status", page["total"] == 0)

        # 4. orders
        _, page = get(f"/admin/orders?event_id={event_id}")
        t.check("orders: filter by event", [o["id"] for o in page["items"]] == [order["id"]], page)
        _, page = get(f"/admin/orders?q={nobody_email}")
        t.check("orders: search by buyer email", order["id"] in [o["id"] for o in page["items"]])
        _, page = get(f"/admin/orders?q={quote('Айгерим')}&status=refunded&limit=200")
        t.check("orders: search by buyer name (Cyrillic) + status", order["id"] in [o["id"] for o in page["items"]])

        # 5. payments: the failed-payment monitor
        _, page = get(f"/admin/payments?event_id={event_id}&status=failed")
        t.check("payments: the failed attempt with its reason", page["total"] == 1
                and page["items"][0]["order_id"] == order["id"] and page["items"][0]["failure_reason"], page)
        _, page = get(f"/admin/payments?event_id={event_id}")
        t.check("payments: activation fee + failed + succeeded",
                sorted((p["purpose"], p["status"]) for p in page["items"]) ==
                [("activation_fee", "succeeded"), ("order", "failed"), ("order", "succeeded")], page)

        # 6. refunds
        _, page = get(f"/admin/refunds?event_id={event_id}")
        t.check("refunds: the refund with amount and reason", page["total"] == 1
                and page["items"][0]["amount"] == 5000 and page["items"][0]["reason"] == "Attendee can't come", page)

        # 7. CSV export uses the same filters and returns every matching row
        status, content_type, raw = t.call_raw("GET", f"/admin/orders?event_id={event_id}&format=csv", token=admin)
        t.check("CSV: 200 text/csv as a download", status == 200 and content_type.startswith("text/csv"), content_type)
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        t.check("CSV: header + one row, Cyrillic intact", len(rows) == 1 and rows[0]["buyer_name"] == "Айгерим Садыкова"
                and rows[0]["id"] == str(order["id"]), rows)
        t.check("CSV: starts with a UTF-8 BOM so Excel reads Cyrillic", raw.startswith(b"\xef\xbb\xbf"))
        status, _, raw = t.call_raw("GET", f"/admin/payments?event_id={event_id}&format=csv&limit=1", token=admin)
        t.check("CSV: ignores limit and exports everything", len(raw.decode("utf-8-sig").strip().splitlines()) == 4)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
