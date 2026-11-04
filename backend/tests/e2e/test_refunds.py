"""Feature 6: cancellations, refunds, event cancellation cascade, and concurrency (lock order)."""
import sys
import threading
from helpers import E2E


def main() -> bool:
    with E2E("cancellations and refunds") as t:
        org, _ = t.new_user(organizer=True)
        alice, bob, carol, stranger, dan, erin, frank = (t.new_user()[0] for _ in range(7))
        sold = lambda tt: t.db_value("select sold_count from ticket_types where id = :i", i=tt)
        ticket_statuses = lambda order_id: sorted(r.status for r in t.db_rows("select status from tickets where order_id = :o", o=order_id))

        eid = t.make_event(org, refund_policy="Full refund up to 7 days before the event")
        vip = t.make_ticket_type(org, eid, name="VIP", price=10000, quantity=5)
        free = t.make_ticket_type(org, eid, name="Free", quantity=10)
        t.activate_paid_sales(org, eid)
        s, ev = t.call("GET", f"/events/{eid}")
        t.check("refund policy is shown on the public event page", ev["refund_policy"] == "Full refund up to 7 days before the event")

        # --- cancelling free registrations and pending checkouts
        _, a_free = t.order(alice, eid, [(free, 2)])
        s, o = t.call("POST", f"/orders/{a_free['id']}/cancel", {}, alice)
        t.check("attendee cancels own free registration", s == 200 and o["status"] == "cancelled" and o["cancelled_at"], o.get("status"))
        t.check("its tickets are cancelled, seats back on sale", ticket_statuses(a_free["id"]) == ["cancelled", "cancelled"] and sold(free) == 0)
        s, b = t.call("POST", f"/orders/{a_free['id']}/cancel", {}, alice)
        t.check("cancelling twice", s == 409, b.get("error"))

        _, b_free = t.order(bob, eid, [(free, 1)])
        s, _ = t.call("POST", f"/orders/{b_free['id']}/cancel", {}, stranger)
        t.check("a stranger can't cancel it", s == 404, f"status {s}")
        s, o = t.call("POST", f"/orders/{b_free['id']}/cancel", {"reason": "Duplicate registration"}, org)
        t.check("organizer cancels a free registration", s == 200 and o["status"] == "cancelled")

        _, c_pending = t.order(carol, eid, [(vip, 2)])
        s, o = t.call("POST", f"/orders/{c_pending['id']}/cancel", {}, carol)
        t.check("attendee abandons a pending checkout: hold released", s == 200 and o["status"] == "cancelled" and sold(vip) == 0)
        s, b = t.call("POST", f"/orders/{c_pending['id']}/pay", {}, carol)
        t.check("a cancelled checkout can't be paid", s == 409, b.get("error"))

        # --- refunding a paid order
        _, a_paid = t.order(alice, eid, [(vip, 2)])
        _, a_paid = t.call("POST", f"/orders/{a_paid['id']}/pay", {}, alice)
        s, b = t.call("POST", f"/orders/{a_paid['id']}/cancel", {}, alice)
        t.check("a paid order can't just be cancelled (must be refunded)", s == 409, b.get("error"))
        s, _ = t.call("POST", f"/orders/{a_paid['id']}/refund", {"reason": "Please refund"}, alice)
        t.check("the buyer can't refund themselves", s == 403, f"status {s}")
        s, _ = t.call("POST", f"/orders/{a_paid['id']}/refund", {"reason": "Please refund"}, stranger)
        t.check("a stranger gets 404", s == 404, f"status {s}")
        s, b = t.call("POST", f"/orders/{a_paid['id']}/refund", {"reason": "x"}, org)
        t.check("a refund needs a reason (3+ characters)", s == 422, f"status {s}")
        s, o = t.call("POST", f"/orders/{a_paid['id']}/refund", {"reason": "Attendee can't come"}, org)
        t.check("organizer refunds the paid order", s == 200 and o["status"] == "refunded" and o["refunded_at"], o.get("status"))
        refund = t.db_rows("select r.amount, r.provider_reference, r.is_simulated, r.payment_id, p.status as paid_status "
                           "from refunds r join payments p on p.id = r.payment_id where r.order_id = :o", o=a_paid["id"])
        t.check("refund record: 20000 KZT back to the original payment, simulated",
                len(refund) == 1 and refund[0].amount == 20000 and refund[0].provider_reference.startswith("SIM-R-")
                and refund[0].is_simulated and refund[0].paid_status == "succeeded", refund and refund[0].provider_reference)
        t.check("its tickets are refunded, seats back on sale", ticket_statuses(a_paid["id"]) == ["refunded", "refunded"] and sold(vip) == 0)
        s, b = t.call("POST", f"/orders/{a_paid['id']}/refund", {"reason": "again please"}, org)
        t.check("refunding twice", s == 409, b.get("error"))
        s, b = t.call("POST", f"/orders/{b_free['id']}/refund", {"reason": "free order"}, org)
        t.check("free orders aren't refundable", s == 409, b.get("error"))

        # --- the door rejects them
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": a_paid["tickets"][0]["code"]}, org)
        t.check("scanner rejects a refunded ticket", r["result"] == "refunded", r["result"])
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": a_free["tickets"][0]["code"]}, org)
        t.check("scanner rejects a cancelled ticket", r["result"] == "cancelled", r["result"])
        s, stats = t.call("GET", f"/events/{eid}/check-in/stats", token=org)
        t.check("check-in stats count them separately", stats["cancelled"] == 3 and stats["refunded"] == 2 and stats["registered"] == 0, str(stats))
        s, sales = t.call("GET", f"/events/{eid}/sales", token=org)
        t.check("sales: gross 20000, refunds 20000, fee returned, payout 0",
                (sales["gross_sales"], sales["refunds"], sales["processing_fees"], sales["estimated_payout"]) == (20000, 20000, 0, 0),
                f"gross={sales['gross_sales']} refunds={sales['refunds']} fees={sales['processing_fees']} payout={sales['estimated_payout']}")

        # --- double-clicked "Refund": exactly one refund
        _, d_paid = t.order(dan, eid, [(vip, 1)])
        t.call("POST", f"/orders/{d_paid['id']}/pay", {}, dan)
        barrier, results = threading.Barrier(5), []

        def refund_once():
            barrier.wait()
            results.append(t.call("POST", f"/orders/{d_paid['id']}/refund", {"reason": "Event moved"}, org)[0])

        threads = [threading.Thread(target=refund_once) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        refunds = t.db_value("select count(*) from refunds where order_id = :o", o=d_paid["id"])
        t.check("5 simultaneous refunds: money returned once", results.count(200) == 1 and refunds == 1,
                f"200 x{results.count(200)}, 409 x{results.count(409)}, refunds={refunds}")

        # --- cancelling a whole event
        eid2 = t.make_event(org)
        vip2 = t.make_ticket_type(org, eid2, name="VIP", price=8000, quantity=10)
        free2 = t.make_ticket_type(org, eid2, name="Free", quantity=10)
        t.activate_paid_sales(org, eid2)
        _, dan_order = t.order(dan, eid2, [(vip2, 2)])
        _, dan_order = t.call("POST", f"/orders/{dan_order['id']}/pay", {}, dan)
        _, erin_order = t.order(erin, eid2, [(free2, 1)])
        _, frank_order = t.order(frank, eid2, [(vip2, 1)])
        s, ev2 = t.call("PATCH", f"/events/{eid2}/cancel", token=org)
        t.check("organizer cancels the event", s == 200 and ev2["status"] == "cancelled", f"status {s}")
        statuses = [t.db_value("select status from orders where id = :i", i=o["id"]) for o in (dan_order, erin_order, frank_order)]
        t.check("paid order refunded, free and pending orders cancelled", statuses == ["refunded", "cancelled", "cancelled"], str(statuses))
        t.check("dan's refund was recorded", t.db_value("select amount from refunds where order_id = :o", o=dan_order["id"]) == 16000)
        t.check("no ticket of the event is still usable",
                t.db_value("select count(*) from tickets where event_id = :e and status in ('valid', 'checked_in')", e=eid2) == 0)
        s, b = t.call("POST", f"/orders/{frank_order['id']}/pay", {}, frank)
        t.check("frank's pending checkout can't be paid anymore", s == 409, b.get("error"))
        s, b = t.order(erin, eid2, [(free2, 1)])
        t.check("no new orders on a cancelled event", s == 404, b.get("error"))
        s, _ = t.call("PATCH", f"/events/{eid2}/cancel", token=org)
        t.check("cancelling twice", s == 409, f"status {s}")
        log = t.db_value("select description from audit_logs where event_id = :e and action = 'event.cancelled'", e=eid2)
        t.check("audit: event cancellation with a summary", log and "1 paid order(s) refunded, 2 other order(s) cancelled" in log, log)

        # --- stress: 10 buyers order while the organizer cancels the event, all at once
        eid3 = t.make_event(org)
        free3 = t.make_ticket_type(org, eid3, name="Free", quantity=100)
        buyers = [t.new_user()[0] for _ in range(10)]
        barrier, codes = threading.Barrier(11), []

        def buy(token):
            barrier.wait()
            codes.append(t.order(token, eid3, [(free3, 1)])[0])

        def cancel():
            barrier.wait()
            codes.append(t.call("PATCH", f"/events/{eid3}/cancel", token=org)[0])

        threads = [threading.Thread(target=buy, args=(b,)) for b in buyers] + [threading.Thread(target=cancel)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        still_confirmed = t.db_value("select count(*) from orders where event_id = :e and status = 'confirmed'", e=eid3)
        counters = (t.db_value("select tickets_sold from events where id = :e", e=eid3), sold(free3))
        t.check("no deadlock or crash: only 200/201/404 answers", set(codes) <= {200, 201, 404} and len(codes) == 11, str(sorted(codes)))
        t.check("nobody is left with a confirmed order on the cancelled event", still_confirmed == 0, f"{still_confirmed} confirmed")
        t.check("counters back to zero", counters == (0, 0), f"tickets_sold, sold_count = {counters}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
