"""Organizer analytics (SRS 4.15): capacity, money, check-ins, sales per day, per ticket type, per campaign, filters."""
import sys
from urllib.parse import urlencode
from sqlalchemy import text
from helpers import E2E, engine


def main() -> bool:
    with E2E("analytics") as t:
        (org, _), (other_org, _), (alice, _), (bob, _), (carol, _), (dave, _), (erin, _) = (
            t.new_user(organizer=True), t.new_user(organizer=True), t.new_user(), t.new_user(), t.new_user(),
            t.new_user(), t.new_user())
        eid = t.make_event(org, capacity=100)
        std = t.make_ticket_type(org, eid, name="Standard", price=10000, quantity=50)
        vip = t.make_ticket_type(org, eid, name="VIP", price=30000, quantity=10)
        free = t.make_ticket_type(org, eid, name="Free", price=0, quantity=40)
        t.activate_paid_sales(org, eid)
        t.call("POST", f"/events/{eid}/campaigns", {"name": "Poster", "code": "SAVE10", "discount_type": "percent",
                                                     "discount_value": 10}, org)

        def buy(token, items, code=None, pay=True):
            body = {"buyer_name": "E2E", "items": [{"ticket_type_id": i, "quantity": q} for i, q in items]}
            if code:
                body["promo_code"] = code
            s, order = t.call("POST", f"/events/{eid}/orders", body, token)
            if pay and order["status"] == "pending":
                s, order = t.call("POST", f"/orders/{order['id']}/pay", {}, token)
            return order

        a = buy(alice, [(std, 2)], "SAVE10")    # 20000 - 10% = 18000, fee 540
        b = buy(bob, [(vip, 1)])                # 30000, fee 900
        c = buy(carol, [(free, 3)])             # free
        buy(dave, [(std, 1)], pay=False)        # a checkout still being paid: held, not sold
        e = buy(erin, [(vip, 1)])               # paid, then refunded below
        t.call("POST", f"/orders/{e['id']}/refund", {"reason": "E2E refund"}, org)
        t.call("POST", f"/events/{eid}/check-in", {"code": a["tickets"][0]["code"]}, org)
        t.call("POST", f"/events/{eid}/check-in", {"code": c["tickets"][0]["code"]}, org)

        # put the sales on known moments. Kazakhstan is UTC+5:
        #   alice 18:00 UTC = 23:00 Dec 1 local;  bob 19:30 UTC = 00:30 Dec 2 local (the next day!)
        #   erin  Dec 2 10:00 UTC;  carol (free, no payment) registered Dec 3 06:00 UTC
        with engine.begin() as conn:
            for order_id, column, moment in [(a["id"], "paid_at", "2026-12-01 18:00+00"), (b["id"], "paid_at", "2026-12-01 19:30+00"),
                                             (e["id"], "paid_at", "2026-12-02 10:00+00"), (c["id"], "created_at", "2026-12-03 06:00+00")]:
                conn.execute(text(f"update orders set {column} = :m where id = :i"), {"m": moment, "i": order_id})

        def analytics(token=org, **params):
            query = ("?" + urlencode(params)) if params else ""
            return t.call("GET", f"/events/{eid}/analytics{query}", token=token)

        # --- no filters ----------------------------------------------------------------------------
        s, r = analytics()
        t.check("organizer gets the dashboard", s == 200, f"status {s}")
        t.check("money: gross 78000, discounts 2000, refunds 30000, fees 1440, net 46560, 2 paid orders (free one isn't)",
                r["money"] == {"gross": 78000, "discounts": 2000, "refunds": 30000, "processing_fees": 1440,
                               "net": 46560, "paid_orders": 2}, f"{r['money']}")
        s, sales = t.call("GET", f"/events/{eid}/sales", token=org)
        t.check("the money agrees with GET /sales", (sales["gross_sales"], sales["discounts"], sales["refunds"],
                sales["processing_fees"], sales["estimated_payout"], sales["paid_orders"]) == (78000, 2000, 30000, 1440, 46560, 2))
        t.check("capacity: 100, 6 sold, 1 held, 93 left, 6.0% sold",
                r["capacity"] == {"capacity": 100, "sold": 6, "held": 1, "remaining": 93, "percent_sold": 6.0}, f"{r['capacity']}")
        t.check("check-in: 2 of 6, 33.3%", r["check_in"] == {"tickets": 6, "checked_in": 2, "percent": 33.3}, f"{r['check_in']}")
        t.check("sales per day, in Kazakhstan time (00:30 local counts for the next day); refunded order left out",
                r["sales_over_time"] == [{"date": "2026-12-01", "orders": 1, "tickets": 2, "revenue": 18000},
                                         {"date": "2026-12-02", "orders": 1, "tickets": 1, "revenue": 30000},
                                         {"date": "2026-12-03", "orders": 1, "tickets": 3, "revenue": 0}], f"{r['sales_over_time']}")
        by_type = {x["name"]: x for x in r["ticket_types"]}
        t.check("Standard: 2 sold at 20000, 1 held, 1 checked in", (by_type["Standard"]["sold"], by_type["Standard"]["revenue"],
                by_type["Standard"]["held"], by_type["Standard"]["checked_in"]) == (2, 20000, 1, 1), f"{by_type['Standard']}")
        t.check("VIP: only the order that stayed paid", (by_type["VIP"]["sold"], by_type["VIP"]["revenue"]) == (1, 30000), f"{by_type['VIP']}")
        t.check("Free: 3 sold, 1 checked in", (by_type["Free"]["sold"], by_type["Free"]["checked_in"]) == (3, 1), f"{by_type['Free']}")
        save10 = r["campaigns"][0]
        t.check("campaign SAVE10: 1 order, 2 tickets, 20000 gross, 2000 off, 18000 net",
                (save10["code"], save10["orders"], save10["tickets"], save10["gross"], save10["discount"], save10["net"])
                == ("SAVE10", 1, 2, 20000, 2000, 18000), f"{save10}")

        # --- a date range: Dec 1 19:00 UTC to Dec 3 00:00 UTC catches bob and erin only --------------
        s, r = analytics(date_from="2026-12-01T19:00:00+00:00", date_to="2026-12-03T00:00:00+00:00")
        t.check("dates: money of the sales in the period only",
                r["money"] == {"gross": 60000, "discounts": 0, "refunds": 30000, "processing_fees": 900,
                               "net": 29100, "paid_orders": 1}, f"{r['money']}")
        t.check("dates: one day of sales", r["sales_over_time"] == [{"date": "2026-12-02", "orders": 1, "tickets": 1,
                                                                    "revenue": 30000}], f"{r['sales_over_time']}")
        t.check("dates: the campaign had no sale in the period", r["campaigns"][0]["orders"] == 0)
        t.check("dates: capacity is still 'right now'", r["capacity"]["sold"] == 6 and r["capacity"]["remaining"] == 93)
        s, r = analytics(date_from="2026-12-01T19:00:00")
        # no date_to, so carol's free registration (Dec 3) is in the period too, but it isn't a paid order
        t.check("a date without a time zone is read as UTC", s == 200 and r["money"]["gross"] == 60000
                and r["money"]["paid_orders"] == 1, f"{s} {r.get('money')}")

        # --- one ticket type ------------------------------------------------------------------------
        s, r = analytics(ticket_type_id=std)
        t.check("type: Standard's own capacity: 50, 2 sold, 1 held, 47 left, 4.0%",
                r["capacity"] == {"capacity": 50, "sold": 2, "held": 1, "remaining": 47, "percent_sold": 4.0}, f"{r['capacity']}")
        t.check("type: check-ins of Standard only", r["check_in"] == {"tickets": 2, "checked_in": 1, "percent": 50.0})
        t.check("type: days with Standard sales, at ticket price", r["sales_over_time"] == [
            {"date": "2026-12-01", "orders": 1, "tickets": 2, "revenue": 20000}], f"{r['sales_over_time']}")
        t.check("type: only that ticket type listed", [x["ticket_type_id"] for x in r["ticket_types"]] == [std])
        t.check("type: money stays per order (unchanged)", r["money"]["gross"] == 78000)

        # --- an event without a capacity: the ticket types' total is the limit ---------------------
        open_eid = t.make_event(org)
        t.make_ticket_type(org, open_eid, quantity=10)
        s, r = t.call("GET", f"/events/{open_eid}/analytics", token=org)
        t.check("no event capacity: the sum of ticket types, nothing sold yet",
                r["capacity"] == {"capacity": 10, "sold": 0, "held": 0, "remaining": 10, "percent_sold": 0.0}
                and r["check_in"]["percent"] is None and r["sales_over_time"] == [], f"{r['capacity']}")

        # --- who may see it, and bad input ----------------------------------------------------------
        s, b = analytics(token=other_org)
        t.check("another organizer is refused", s == 403 and b["error"] == "EventAccessDeniedError", f"status {s}")
        s, b = analytics(token=alice)
        t.check("an attendee is refused", s == 404 and b["error"] == "OrganizerNotFoundError", f"status {s}")
        s, _ = t.call("GET", f"/events/{eid}/analytics")
        t.check("no login", s == 401, f"status {s}")
        other_tt = t.make_ticket_type(org, open_eid)
        s, b = analytics(ticket_type_id=other_tt)
        t.check("another event's ticket type", s == 404 and b["error"] == "TicketTypeNotFoundError", f"status {s}")
        s, b = analytics(date_from="yesterday")
        t.check("a date that isn't a date", s == 422 and b["error"] == "VALIDATION_ERROR", f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
