"""Feature 5: paid checkout with holds, simulated payment, expiry release and organizer sales summary."""
import sys
import threading
import time
from datetime import datetime, timezone
from sqlalchemy import text
from helpers import E2E, engine


def expire_now(order_id: int):
    # pretend the 10-minute hold is over, without waiting 10 minutes
    with engine.begin() as c:
        c.execute(text("update orders set expires_at = now() - interval '1 minute' where id = :i"), {"i": order_id})


def main() -> bool:
    with E2E("checkout") as t:
        org, _ = t.new_user(organizer=True)
        alice, bob, carol, dave, erin, frank, grace = (t.new_user()[0] for _ in range(7))
        eid = t.make_event(org)
        vip = t.make_ticket_type(org, eid, name="VIP", price=10000, quantity=3)
        free = t.make_ticket_type(org, eid, name="Free", quantity=10)
        early = t.make_ticket_type(org, eid, name="Early", price=5000, quantity=1)
        promo = t.make_ticket_type(org, eid, name="Promo", price=2000, quantity=5)
        t.activate_paid_sales(org, eid)
        sold = lambda tt: t.db_value("select sold_count from ticket_types where id = :i", i=tt)

        # --- checkout holds the tickets, but issues none
        s, o = t.order(alice, eid, [(vip, 2)])
        expires = datetime.fromisoformat(o["expires_at"]) if s == 201 else None
        t.check("paid order starts pending, no tickets yet", s == 201 and o["status"] == "pending" and o["tickets"] == [], o.get("status"))
        t.check("total 20000 KZT, hold of about 10 minutes",
                o["total_amount"] == 20000 and 9 * 60 < (expires - datetime.now(timezone.utc)).total_seconds() <= 10 * 60)
        t.check("the 2 tickets are held", sold(vip) == 2, f"sold_count={sold(vip)}")
        s, b = t.order(bob, eid, [(vip, 2)])
        t.check("held tickets can't be bought by someone else", s == 409, b.get("error"))

        # --- paying
        s, b = t.call("POST", f"/orders/{o['id']}/pay", {}, bob)
        t.check("someone else can't pay my order", s == 404, f"status {s}")
        s, b = t.call("POST", f"/orders/{o['id']}/pay", {"simulate_outcome": "failure"}, alice)
        t.check("declined payment", s == 402, b.get("error"))
        s, mine = t.call("GET", f"/orders/{o['id']}", token=alice)
        t.check("after a decline: still pending, still no tickets, can retry", mine["status"] == "pending" and mine["tickets"] == [])
        s, paid = t.call("POST", f"/orders/{o['id']}/pay", {}, alice)
        t.check("successful payment confirms the order", s == 200 and paid["status"] == "confirmed" and paid["paid_at"], paid.get("status"))
        t.check("tickets are issued only now: 2 T- codes",
                len(paid["tickets"]) == 2 and all(tk["code"].startswith("T-") for tk in paid["tickets"]))
        payments = dict(t.db_rows("select status, count(*) from payments where order_id = :o group by status", o=o["id"]))
        t.check("both attempts on record: 1 failed, 1 succeeded", payments == {"failed": 1, "succeeded": 1}, str(payments))
        s, b = t.call("POST", f"/orders/{o['id']}/pay", {}, alice)
        t.check("paying a confirmed order again", s == 409, b.get("error"))
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": paid["tickets"][0]["code"]}, org)
        t.check("a paid ticket can be checked in", r["result"] == "checked_in", r["result"])

        # --- mixed paid + free, and free-only
        s, mixed = t.order(bob, eid, [(vip, 1), (free, 2)])
        t.check("mixed order: pending for 10000 KZT", s == 201 and mixed["status"] == "pending" and mixed["total_amount"] == 10000)
        s, mixed = t.call("POST", f"/orders/{mixed['id']}/pay", {}, bob)
        t.check("after payment: 3 tickets (1 VIP + 2 free)", s == 200 and len(mixed["tickets"]) == 3)
        s, fo = t.order(frank, eid, [(free, 1)])
        t.check("free-only order is still confirmed immediately", s == 201 and fo["status"] == "confirmed" and len(fo["tickets"]) == 1)

        # --- abandoned checkout: the hold expires and the ticket goes back on sale
        s, carol_order = t.order(carol, eid, [(early, 1)])
        t.check("carol holds the only Early ticket", s == 201 and sold(early) == 1)
        s, b = t.order(dave, eid, [(early, 1)])
        t.check("dave can't get it while it's held", s == 409, b.get("error"))
        expire_now(carol_order["id"])
        s, dave_order = t.order(dave, eid, [(early, 1)])
        t.check("after carol's hold expires, dave gets it", s == 201, f"status {s}")
        t.check("released exactly once: sold_count = 1", sold(early) == 1, f"sold_count={sold(early)}")
        s, b = t.call("POST", f"/orders/{carol_order['id']}/pay", {}, carol)
        t.check("carol can't pay her expired order", s == 409 and b["error"] == "OrderExpiredError", b.get("error"))
        expire_now(dave_order["id"])
        s, b = t.call("POST", f"/orders/{dave_order['id']}/pay", {}, dave)
        t.check("paying after the hold ran out is refused", s == 409 and b["error"] == "OrderExpiredError", b.get("error"))
        t.check("...and the ticket is back on sale", sold(early) == 0, f"sold_count={sold(early)}")
        statuses = [t.db_value("select status from orders where id = :i", i=i) for i in (carol_order["id"], dave_order["id"])]
        t.check("no tickets were ever created for expired orders", statuses == ["expired", "expired"] and
                t.db_value("select count(*) from tickets where ticket_type_id = :i", i=early) == 0, str(statuses))

        # --- the background sweeper releases holds even if nobody else is buying
        s, swept = t.order(grace, eid, [(promo, 2)])
        expire_now(swept["id"])
        time.sleep(2.5)
        s, swept = t.call("GET", f"/orders/{swept['id']}", token=grace)
        t.check("background sweeper expired the abandoned hold", swept["status"] == "expired" and sold(promo) == 0,
                f"status={swept['status']}, sold_count={sold(promo)}")

        # --- double-clicked "Pay": 5 simultaneous payments, exactly one charge
        s, erin_order = t.order(erin, eid, [(promo, 1)])
        barrier = threading.Barrier(5)
        results = []

        def pay():
            barrier.wait()
            results.append(t.call("POST", f"/orders/{erin_order['id']}/pay", {}, erin)[0])

        threads = [threading.Thread(target=pay) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        charges = t.db_value("select count(*) from payments where order_id = :o and status = 'succeeded'", o=erin_order["id"])
        tickets = t.db_value("select count(*) from tickets where order_id = :o", o=erin_order["id"])
        t.check("5 simultaneous payments: one charge, one ticket",
                results.count(200) == 1 and charges == 1 and tickets == 1, f"200 x{results.count(200)}, charges={charges}, tickets={tickets}")

        # --- suspended mid-checkout
        s, held = t.order(grace, eid, [(promo, 2)])
        admin, _ = t.new_user(admin=True)
        t.call("POST", f"/admin/events/{eid}/paid-sales/suspend", {"reason": "Fraud check"}, admin)
        s, b = t.call("POST", f"/orders/{held['id']}/pay", {}, grace)
        t.check("payment refused while paid sales are suspended", s == 409 and b["error"] == "PaidSalesNotActiveError", b.get("error"))
        t.call("POST", f"/admin/events/{eid}/paid-sales/reinstate", token=admin)

        # --- organizer sales summary
        s, sales = t.call("GET", f"/events/{eid}/sales", token=org)
        t.check("sales: gross 32000 (20000 + 10000 + 2000)", s == 200 and sales["gross_sales"] == 32000, str(sales.get("gross_sales")))
        t.check("fees 3%: 600 + 300 + 60 = 960, payout 31040",
                sales["processing_fees"] == 960 and sales["estimated_payout"] == 31040 and sales["refunds"] == 0,
                f"fees={sales['processing_fees']}, payout={sales['estimated_payout']}")
        t.check("3 paid orders, marked simulated", sales["paid_orders"] == 3 and sales["is_simulated"] is True)
        by_name = {row["name"]: row for row in sales["ticket_types"]}
        t.check("VIP: 3 sold, 0 available", by_name["VIP"]["sold"] == 3 and by_name["VIP"]["available"] == 0, str(by_name["VIP"]))
        t.check("Free: 3 sold, 7 available", by_name["Free"]["sold"] == 3 and by_name["Free"]["available"] == 7, str(by_name["Free"]))
        t.check("Promo: 1 sold, 2 reserved by a pending checkout, 2 available",
                (by_name["Promo"]["sold"], by_name["Promo"]["reserved"], by_name["Promo"]["available"]) == (1, 2, 2), str(by_name["Promo"]))
        s, _ = t.call("GET", f"/events/{eid}/sales", token=alice)
        t.check("an attendee can't see the sales summary", s != 200, f"status {s}")

        actions = dict(t.db_rows("select action, count(*) from audit_logs where event_id = :e and action like 'order.%' group by action", e=eid))
        t.check("audit log: paid, failed and expired orders recorded",
                actions.get("order.paid") == 3 and actions.get("order.payment_failed") == 1 and actions.get("order.expired") == 3, str(actions))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
