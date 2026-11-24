"""Emails from orders, payments, cancellations, refunds and event changes (SRS 4.10).

Checks what lands in email_outbox (the sender is off in tests), and renders every email with the real
templates, so a missing placeholder fails here instead of in the background sender.
"""
import sys
from datetime import datetime, timedelta
from helpers import E2E, iso
from services.email_templates import render_email


def main() -> bool:
    with E2E("order emails") as t:
        (org, _), (alice, alice_email), (bob, bob_email), (carol, carol_email) = (
            t.new_user(organizer=True), t.new_user(), t.new_user(), t.new_user())
        eid = t.make_event(org, title="Spring Concert")
        free = t.make_ticket_type(org, eid, name="Free", price=0)
        paid = t.make_ticket_type(org, eid, name="Paid", price=7000)
        last = t.make_ticket_type(org, eid, name="Last seat", price=0, quantity=1)
        t.activate_paid_sales(org, eid)

        def outbox(email, template=None):
            # registration's own "verify your email" (Dev B's account emails) isn't what this test is about
            sql = "select template, data from email_outbox where to_email = :e and template <> 'verify_email'"
            if template:
                sql += " and template = :t"
            return t.db_rows(sql + " order by id", e=email, t=template)

        # --- free registration ----------------------------------------------------------------------
        s, alice_order = t.order(alice, eid, [(free, 1)])
        rows = outbox(alice_email)
        t.check("free registration: 'order confirmed'", [r.template for r in rows] == ["order_confirmed"], f"{rows}")
        t.check("with the order, event and title", rows[0].data == {"order_id": alice_order["id"], "event_id": eid,
                                                                     "event_title": "Spring Concert"}, f"{rows[0].data}")

        # --- paid checkout --------------------------------------------------------------------------
        s, bob_order = t.order(bob, eid, [(paid, 2)])
        t.check("a checkout waiting for payment sends nothing", outbox(bob_email) == [])
        t.call("POST", f"/orders/{bob_order['id']}/pay", {"simulate_outcome": "failure"}, bob)
        rows = outbox(bob_email, "payment_failed")
        t.check("declined payment: 'payment failed' with the amount", len(rows) == 1 and rows[0].data["amount"] == 14000,
                f"{rows}")
        t.call("POST", f"/orders/{bob_order['id']}/pay", {}, bob)
        t.check("successful retry: 'order confirmed'", len(outbox(bob_email, "order_confirmed")) == 1)

        # an order that fails (sold out) rolls back, and its email with it
        t.order(carol, eid, [(last, 1)])
        s, _ = t.order(alice, eid, [(last, 1)])
        t.check("a refused order queues no email", s == 409 and len(outbox(alice_email, "order_confirmed")) == 1, f"status {s}")

        # --- cancel and refund ----------------------------------------------------------------------
        t.call("POST", f"/orders/{alice_order['id']}/cancel", {"reason": "Can't come"}, alice)
        rows = outbox(alice_email, "order_cancelled")
        t.check("cancelled order: email with the reason", len(rows) == 1 and rows[0].data["reason"] == "Can't come", f"{rows}")
        t.call("POST", f"/orders/{bob_order['id']}/refund", {"reason": "Double booking"}, org)
        rows = outbox(bob_email, "order_refunded")
        t.check("refund: email with amount and reason", len(rows) == 1 and (rows[0].data["amount"], rows[0].data["reason"])
                == (14000, "Double booking"), f"{rows}")

        # --- event changes ---------------------------------------------------------------------------
        t.order(carol, eid, [(free, 1)])  # carol now has 2 orders: she should still get one email per change
        t.call("PATCH", f"/events/{eid}", {"title": "Spring Concert", "description": "Now with an encore"}, org)
        t.check("a change that doesn't affect attendees emails nobody", outbox(carol_email, "event_updated") == [])
        s, ev = t.call("GET", f"/events/{eid}")
        new_start = datetime.fromisoformat(ev["start_time"]) + timedelta(days=1)
        new_end = datetime.fromisoformat(ev["end_time"]) + timedelta(days=1)
        t.call("PATCH", f"/events/{eid}", {"start_time": iso(new_start), "end_time": iso(new_end)}, org)
        rows = outbox(carol_email, "event_updated")
        t.check("new date: one email per ticket holder, even with 2 orders", len(rows) == 1, f"{len(rows)} emails")
        t.check("it says what changed, in Kazakhstan time", rows and "Starts:" in rows[0].data["changes"]
                and "Ends:" in rows[0].data["changes"] and "(UTC+5)" in rows[0].data["changes"], f"{rows and rows[0].data}")
        t.check("refunded and cancelled buyers aren't told", outbox(bob_email, "event_updated") == []
                and outbox(alice_email, "event_updated") == [])
        t.call("PATCH", f"/events/{eid}", {"venue_name": "Barys Arena, Hall 2"}, org)
        rows = outbox(carol_email, "event_updated")
        t.check("new venue: 'Where' line", len(rows) == 2 and "Where:" in rows[1].data["changes"], f"{rows[-1].data}")
        draft = t.make_event(org, publish=False)
        t.call("PATCH", f"/events/{draft}", {"start_time": iso(new_start), "end_time": iso(new_end)}, org)
        t.check("a draft has no attendees to tell", t.db_value(
            "select count(*) from email_outbox where template = 'event_updated' and (data->>'event_id')::int = :e", e=draft) == 0)

        # --- event cancelled: one email per person, nothing else -------------------------------------
        (dave, dave_email), (erin, erin_email) = t.new_user(), t.new_user()
        eid2 = t.make_event(org, title="Autumn Gala")
        free2 = t.make_ticket_type(org, eid2, price=0)
        paid2 = t.make_ticket_type(org, eid2, name="Paid", price=5000)
        t.activate_paid_sales(org, eid2)
        s, d1 = t.order(dave, eid2, [(paid2, 1)])
        t.call("POST", f"/orders/{d1['id']}/pay", {}, dave)
        t.order(dave, eid2, [(free2, 1)])
        t.order(erin, eid2, [(paid2, 1)])  # still being paid
        t.call("PATCH", f"/events/{eid2}/cancel", token=org)
        rows = [r for r in outbox(dave_email) if r.data.get("event_id") == eid2]
        t.check("event cancelled: dave gets exactly one 'event cancelled' (2 orders, 1 refunded)",
                [r.template for r in rows] == ["order_confirmed", "order_confirmed", "event_cancelled"], f"{[r.template for r in rows]}")
        t.check("and so does erin, whose checkout was open", [r.template for r in outbox(erin_email)] == ["event_cancelled"])

        # --- every queued email renders with its template --------------------------------------------
        everyone = [alice_email, bob_email, carol_email, dave_email, erin_email]
        rows = t.db_rows("select template, data from email_outbox where to_email = any(:e)", e=everyone)
        failures = []
        for row in rows:
            try:
                render_email(row.template, row.data)
            except KeyError as missing:
                failures.append(f"{row.template} lacks {missing}")
        t.check(f"all {len(rows)} emails render with the real templates", rows and not failures, f"{failures}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
