"""Feature 2: orders, free registration, inventory rules, rollback and concurrency."""
import sys
import threading
from datetime import timedelta
from helpers import E2E, NOW


def main() -> bool:
    with E2E("orders") as t:
        (org, _), (alice, _), (bob, _) = t.new_user(organizer=True), t.new_user(), t.new_user()

        # happy path
        eid = t.make_event(org)
        standard = t.make_ticket_type(org, eid, quantity=5, max_per_order=3)
        s, o = t.order(alice, eid, [(standard, 2)])
        t.check("register 2 free tickets", s == 201, f"status {s}")
        t.check("order confirmed, total 0, price snapshot 0",
                o["status"] == "confirmed" and o["total_amount"] == 0 and o["items"][0]["unit_price"] == 0)
        codes = [ticket["code"] for ticket in o["tickets"]]
        t.check("2 tickets with unique T- codes", len(set(codes)) == 2 and all(c.startswith("T-") for c in codes))
        s, mine = t.call("GET", "/orders/me", token=alice)
        t.check("GET /orders/me shows the order with tickets", s == 200 and mine[0]["id"] == o["id"] and len(mine[0]["tickets"]) == 2)
        s, _ = t.call("GET", f"/orders/{o['id']}", token=alice)
        t.check("owner can open the order", s == 200, f"status {s}")
        s, _ = t.call("GET", f"/orders/{o['id']}", token=bob)
        t.check("someone else gets 404", s == 404, f"status {s}")

        # rules
        s, b = t.order(alice, eid, [(standard, 4)])
        t.check("more than max_per_order (3)", s == 400, b.get("error"))
        s, b = t.order(alice, eid, [(standard, 1), (standard, 1)])
        t.check("same ticket type twice in one order", s == 400, b.get("error"))
        vip = t.make_ticket_type(org, eid, name="VIP", price=5000)
        s, b = t.order(alice, eid, [(vip, 1)])
        t.check("paid ticket type (Feature 5)", s == 409, b.get("error"))
        late = t.make_ticket_type(org, eid, name="Late", sales_start=NOW + timedelta(days=2))
        s, b = t.order(alice, eid, [(late, 1)])
        t.check("sales window not open yet", s == 409, b.get("error"))
        hidden = t.make_ticket_type(org, eid, name="Hidden")
        t.call("PATCH", f"/ticket_types/{hidden}/hide", token=org)
        s, b = t.order(alice, eid, [(hidden, 1)])
        t.check("hidden ticket type", s == 409, b.get("error"))
        draft = t.make_event(org, publish=False)
        s, b = t.order(alice, draft, [(standard, 1)])
        t.check("draft event", s == 404, b.get("error"))

        # sold out
        s, _ = t.order(bob, eid, [(standard, 3)])
        t.check("bob takes the last 3", s == 201, f"status {s}")
        s, b = t.order(bob, eid, [(standard, 1)])
        t.check("one more is rejected", s == 409, b.get("error"))
        s, b = t.call("PATCH", f"/ticket-types/{standard}", {"quantity": 4}, org)
        t.check("organizer can't lower quantity below sold (5)", s == 409, b.get("error"))
        s, attendees = t.call("GET", f"/events/{eid}/attendees", token=org)
        t.check("organizer sees 5 attendees", s == 200 and len(attendees) == 5)
        s, _ = t.call("GET", f"/events/{eid}/attendees", token=alice)
        t.check("an attendee can't see the attendee list", s != 200, f"status {s}")

        # event capacity + rollback
        cap_event = t.make_event(org, capacity=3)
        big = t.make_ticket_type(org, cap_event, quantity=10)
        s, _ = t.order(alice, cap_event, [(big, 2)])
        t.check("2 of capacity 3", s == 201, f"status {s}")
        s, b = t.order(bob, cap_event, [(big, 2)])
        t.check("2 more exceeds capacity", s == 409, b.get("error"))
        sold = t.db_value("select sold_count from ticket_types where id = :i", i=big)
        t.check("ticket-type reservation was rolled back", sold == 2, f"sold_count={sold} (2 = rolled back, 4 = leaked)")

        # concurrency: 20 simultaneous buyers, 5 tickets
        race_event = t.make_event(org)
        race = t.make_ticket_type(org, race_event, quantity=5, max_per_order=1)
        barrier = threading.Barrier(20)
        statuses = []

        def buyer():
            barrier.wait()
            statuses.append(t.order(alice, race_event, [(race, 1)])[0])

        threads = [threading.Thread(target=buyer) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        sold = t.db_value("select sold_count from ticket_types where id = :i", i=race)
        tickets = t.db_value("select count(*) from tickets where ticket_type_id = :i", i=race)
        t.check("20 buyers, 5 tickets: exactly 5 orders succeed", statuses.count(201) == 5,
                f"201 x{statuses.count(201)}, 409 x{statuses.count(409)}")
        t.check("exactly 5 tickets exist, sold_count = 5", tickets == 5 and sold == 5, f"tickets={tickets}, sold_count={sold}")

        logs = t.db_value("select count(*) from audit_logs where action = 'order.created' and event_id = any(:ids)", ids=t.event_ids)
        t.check("every successful order is in the audit log", logs == 8, f"{logs} rows")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
