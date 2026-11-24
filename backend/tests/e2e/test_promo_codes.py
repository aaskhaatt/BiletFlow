"""Promo codes (SRS 4.14): campaigns, the discount at checkout, the redemption limit under concurrency, stats."""
import sys
import threading
from datetime import timedelta
from sqlalchemy import text
from helpers import E2E, NOW, iso, engine

CODE_ALPHABET = set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")


def main() -> bool:
    with E2E("promo codes") as t:
        (org, _), (other_org, _), (alice, _), (bob, _), (carol, _), (dave, _) = (
            t.new_user(organizer=True), t.new_user(organizer=True), t.new_user(), t.new_user(), t.new_user(), t.new_user())
        eid = t.make_event(org)
        free = t.make_ticket_type(org, eid, name="Free", price=0)
        std = t.make_ticket_type(org, eid, name="Standard", price=10000, quantity=50)
        vip = t.make_ticket_type(org, eid, name="VIP", price=30000, quantity=20)
        odd = t.make_ticket_type(org, eid, name="Odd", price=999)
        t.activate_paid_sales(org, eid)
        other_eid = t.make_event(other_org)
        other_tt = t.make_ticket_type(other_org, other_eid, price=5000)

        def campaign(body, token=org, event_id=eid):
            return t.call("POST", f"/events/{event_id}/campaigns", {"name": "E2E campaign", **body}, token)

        def order(token, items, code=None):
            body = {"buyer_name": "E2E Buyer", "items": [{"ticket_type_id": i, "quantity": q} for i, q in items]}
            if code is not None:
                body["promo_code"] = code
            return t.call("POST", f"/events/{eid}/orders", body, token)

        def preview(token, items, code=None):
            body = {"items": [{"ticket_type_id": i, "quantity": q} for i, q in items], "promo_code": code}
            return t.call("POST", f"/events/{eid}/orders/preview", body, token)

        def uses(campaign_id):
            return t.call("GET", f"/campaigns/{campaign_id}", token=org)[1]["redemptions_count"]

        # --- creating campaigns --------------------------------------------------------------------
        s, summer = campaign({"code": "summer20", "discount_type": "percent", "discount_value": 20})
        t.check("create a 20% code", s == 201 and summer["code"] == "SUMMER20", f"{s} {summer.get('code')}")
        t.check("starts with zero uses and zero stats", summer["redemptions_count"] == 0
                and summer["stats"] == {"orders": 0, "tickets": 0, "gross": 0, "discount": 0, "net": 0})
        s, generated = campaign({"discount_type": "fixed", "discount_value": 1000})
        t.check("no code given: a random readable one", s == 201 and len(generated["code"]) == 8
                and set(generated["code"]) <= CODE_ALPHABET, generated.get("code"))
        s, b = campaign({"code": "SUMMER20", "discount_type": "percent", "discount_value": 10})
        t.check("same code twice at one event", s == 409 and b["error"] == "PromoCodeAlreadyExistsError", f"status {s}")
        s, _ = campaign({"code": "SUMMER20", "discount_type": "percent", "discount_value": 10}, token=other_org, event_id=other_eid)
        t.check("the same code at another event is fine", s == 201, f"status {s}")
        s, _ = campaign({"discount_type": "percent", "discount_value": 150})
        t.check("more than 100%", s == 422, f"status {s}")
        s, _ = campaign({"discount_type": "percent", "discount_value": 10,
                         "starts_at": iso(NOW + timedelta(days=2)), "ends_at": iso(NOW + timedelta(days=1))})
        t.check("ends before it starts", s == 422, f"status {s}")
        s, _ = campaign({"code": "no spaces", "discount_type": "percent", "discount_value": 10})
        t.check("code with a space", s == 422, f"status {s}")
        s, b = campaign({"discount_type": "percent", "discount_value": 10, "ticket_type_ids": [free]})
        t.check("limited to a free ticket type", s == 400 and b["error"] == "InvalidCampaignError", f"status {s}")
        s, b = campaign({"discount_type": "percent", "discount_value": 10, "ticket_type_ids": [other_tt]})
        t.check("limited to another event's ticket type", s == 400 and b["error"] == "InvalidCampaignError", f"status {s}")
        s, b = campaign({"discount_type": "percent", "discount_value": 10}, token=other_org)
        t.check("another organizer is refused", s == 403 and b["error"] == "EventAccessDeniedError", f"status {s}")
        s, b = campaign({"discount_type": "percent", "discount_value": 10}, token=alice)
        t.check("an attendee is refused", s == 404 and b["error"] == "OrganizerNotFoundError", f"status {s}")
        s, b = t.call("GET", f"/campaigns/{summer['id']}", token=other_org)
        t.check("another organizer can't read it", s == 403, f"status {s}")
        s, _ = t.call("GET", f"/events/{eid}/campaigns")
        t.check("no login", s == 401, f"status {s}")

        s, vip_only = campaign({"code": "VIPONLY", "discount_type": "fixed", "discount_value": 5000, "ticket_type_ids": [vip]})
        t.check("a fixed 5000 KZT code for VIP only", s == 201 and vip_only["ticket_type_ids"] == [vip], f"status {s}")

        # --- the price preview ---------------------------------------------------------------------
        s, p = preview(alice, [(std, 2)], "summer20")
        t.check("preview: 20% off 20000", s == 200 and p == {"subtotal": 20000, "discount": 4000, "total": 16000,
                                                            "promo_code": "SUMMER20"}, f"{s} {p}")
        s, p = preview(alice, [(std, 1)])
        t.check("preview without a code", s == 200 and p["discount"] == 0 and p["total"] == 10000)
        s, b = preview(alice, [(std, 1)], "NOPE")
        t.check("unknown code", s == 404 and b["error"] == "PromoCodeNotFoundError", f"status {s}")
        s, b = preview(alice, [(std, 1)], "VIPONLY")
        t.check("VIP code on a Standard ticket", s == 409 and b["error"] == "PromoCodeNotApplicableError", f"status {s}")
        s, b = preview(alice, [(free, 1)], "SUMMER20")
        t.check("any code on free tickets", s == 409 and b["error"] == "PromoCodeNotApplicableError", f"status {s}")
        s, _ = preview(None, [(std, 1)], "SUMMER20")
        t.check("preview needs a login", s == 401, f"status {s}")

        # --- the discount at checkout --------------------------------------------------------------
        s, o = order(alice, [(std, 2), (vip, 1)], "SUMMER20")
        t.check("order with 20% off: 50000 -> 40000", s == 201 and o["total_amount"] == 40000 and o["discount_amount"] == 10000
                and o["promo_code"] == "SUMMER20" and o["status"] == "pending", f"{s} {o.get('total_amount')}")
        s, alice_paid = t.call("POST", f"/orders/{o['id']}/pay", {}, alice)
        t.check("pays the discounted amount", s == 200 and alice_paid["status"] == "confirmed", f"status {s}")
        fee = t.db_value("select processing_fee from orders where id = :i", i=o["id"])
        t.check("3% fee on the discounted total", fee == 1200, f"fee {fee}")

        s, o = order(bob, [(std, 1), (vip, 1)], "VIPONLY")
        t.check("VIP-only code discounts only the VIP ticket", s == 201 and o["discount_amount"] == 5000
                and o["total_amount"] == 35000, f"{s} {o.get('discount_amount')}")
        t.call("POST", f"/orders/{o['id']}/cancel", {}, bob)

        campaign({"code": "FIFTEEN", "discount_type": "percent", "discount_value": 15})
        s, o = order(carol, [(odd, 1)], "FIFTEEN")
        t.check("15% of 999 rounds down to 149", o["discount_amount"] == 149 and o["total_amount"] == 850, f"{o.get('discount_amount')}")
        t.call("POST", f"/orders/{o['id']}/cancel", {}, carol)

        s, _ = campaign({"code": "FREEPASS", "discount_type": "fixed", "discount_value": 100000, "ticket_type_ids": [std]})
        s, o = order(dave, [(std, 1)], "FREEPASS")
        t.check("a discount covering everything: confirmed at once, ticket issued", s == 201 and o["total_amount"] == 0
                and o["status"] == "confirmed" and len(o["tickets"]) == 1, f"{s} {o.get('status')}")

        # --- the redemption limit, and uses coming back --------------------------------------------
        s, limited = campaign({"code": "LIMIT2", "discount_type": "percent", "discount_value": 10, "max_redemptions": 2})
        s, bob_order = order(bob, [(std, 1)], "LIMIT2")
        s, carol_order = order(carol, [(std, 1)], "LIMIT2")
        t.check("two checkouts take both uses", uses(limited["id"]) == 2)
        s, b = order(dave, [(std, 1)], "LIMIT2")
        t.check("third buyer: used up", s == 409 and b["error"] == "PromoCodeUsedUpError", f"status {s}")
        s, b = preview(dave, [(std, 1)], "LIMIT2")
        t.check("the preview says so too", s == 409 and b["error"] == "PromoCodeUsedUpError", f"status {s}")
        with engine.begin() as c:
            c.execute(text("update orders set expires_at = now() - interval '1 minute' where id = :i"), {"i": carol_order["id"]})
        s, dave_order = order(dave, [(std, 1)], "LIMIT2")
        t.check("an expired checkout gives its use back", s == 201 and uses(limited["id"]) == 2, f"status {s}")
        t.call("POST", f"/orders/{bob_order['id']}/cancel", {}, bob)
        t.check("a cancelled order gives its use back", uses(limited["id"]) == 1, f"uses {uses(limited['id'])}")
        s, b = t.call("PATCH", f"/campaigns/{limited['id']}", {"max_redemptions": 1}, org)
        t.check("the limit can go down to the uses taken", s == 200 and b["max_redemptions"] == 1, f"status {s}")
        t.call("POST", f"/orders/{dave_order['id']}/cancel", {}, dave)
        s, race = campaign({"code": "RACE3", "discount_type": "percent", "discount_value": 50, "max_redemptions": 3})

        # 10 buyers at the same moment, 3 uses: exactly 3 get the discount
        racers = [t.new_user()[0] for _ in range(10)]
        statuses = []
        def buy(token):
            statuses.append(order(token, [(std, 1)], "RACE3")[0])
        threads = [threading.Thread(target=buy, args=(token,)) for token in racers]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        t.check("10 buyers racing for 3 uses: exactly 3 win", sorted(statuses) == [201] * 3 + [409] * 7, f"{sorted(statuses)}")
        t.check("and the counter says 3", uses(race["id"]) == 3, f"uses {uses(race['id'])}")

        # --- switching off, dates, and bad edits ---------------------------------------------------
        s, b = t.call("PATCH", f"/campaigns/{summer['id']}", {"is_active": False}, org)
        t.check("switch a code off", s == 200 and b["is_active"] is False, f"status {s}")
        s, b = preview(bob, [(std, 1)], "SUMMER20")
        t.check("a switched-off code is refused", s == 409 and b["error"] == "PromoCodeNotActiveError", f"status {s}")
        t.call("PATCH", f"/campaigns/{summer['id']}", {"is_active": True, "ends_at": iso(NOW - timedelta(minutes=1))}, org)
        s, b = preview(bob, [(std, 1)], "SUMMER20")
        t.check("an ended code is refused", s == 409 and b["error"] == "PromoCodeNotActiveError", f"status {s}")
        s, b = t.call("PATCH", f"/campaigns/{summer['id']}", {"ends_at": None}, org)
        t.check("ends_at can be cleared with null", s == 200 and b["ends_at"] is None, f"status {s}")
        s, _ = preview(bob, [(std, 1)], "SUMMER20")
        t.check("and the code works again", s == 200, f"status {s}")
        s, _ = campaign({"code": "LATER", "discount_type": "percent", "discount_value": 10, "starts_at": iso(NOW + timedelta(days=1))})
        s, b = preview(bob, [(std, 1)], "LATER")
        t.check("a code that hasn't started is refused", s == 409 and b["error"] == "PromoCodeNotActiveError", f"status {s}")
        s, b = t.call("PATCH", f"/campaigns/{race['id']}", {"max_redemptions": 2}, org)
        t.check("the limit can't go below the uses taken", s == 400 and b["error"] == "InvalidCampaignError", f"status {s}")
        s, b = t.call("PATCH", f"/campaigns/{summer['id']}", {"starts_at": iso(NOW + timedelta(days=3)), "ends_at": iso(NOW + timedelta(days=2))}, org)
        t.check("an edit can't make it end before it starts", s == 400, f"status {s}")

        # --- the organizer's numbers ---------------------------------------------------------------
        s, all_campaigns = t.call("GET", f"/events/{eid}/campaigns", token=org)
        by_code = {c["code"]: c for c in all_campaigns}
        t.check("list: every campaign of the event", s == 200 and {"SUMMER20", "VIPONLY", "LIMIT2", "RACE3", "FREEPASS"} <= set(by_code))
        t.check("SUMMER20 stats: 1 paid order, 3 tickets, 50000 gross, 10000 off, 40000 net",
                by_code["SUMMER20"]["stats"] == {"orders": 1, "tickets": 3, "gross": 50000, "discount": 10000, "net": 40000},
                f"{by_code['SUMMER20']['stats']}")
        s, sales = t.call("GET", f"/events/{eid}/sales", token=org)
        expected_discounts = 10000 + 10000  # alice's SUMMER20 order + dave's FREEPASS ticket
        t.check("sales summary reports discounts", s == 200 and sales["discounts"] == expected_discounts, f"{sales.get('discounts')}")

        t.call("POST", f"/orders/{alice_paid['id']}/refund", {"reason": "E2E refund"}, org)
        s, c = t.call("GET", f"/campaigns/{summer['id']}", token=org)
        t.check("a refund gives the use back; refunded orders leave the stats", c["redemptions_count"] == 0 and c["stats"]["orders"] == 0,
                f"{c['redemptions_count']} {c['stats']}")

        # --- promo codes are not tickets -----------------------------------------------------------
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": "SUMMER20"}, org)
        t.check("scanning a promo code admits nobody", s == 200 and r["result"] == "invalid", f"{s} {r.get('result')}")

        # --- audit log and a cancelled event -------------------------------------------------------
        # 8 codes created at this event; 4 edits succeeded (LIMIT2's limit, SUMMER20 off, on + end date, end date cleared).
        # Refused edits change nothing, so they leave no row.
        actions = [r.action for r in t.db_rows("select action from audit_logs where event_id = :e and action like 'campaign.%'", e=eid)]
        t.check("audit: every create and real edit is logged", actions.count("campaign.created") == 8
                and actions.count("campaign.updated") == 4, f"{actions.count('campaign.created')} created, "
                                                           f"{actions.count('campaign.updated')} updated")
        cancelled = t.make_event(org)
        t.call("PATCH", f"/events/{cancelled}/cancel", token=org)
        s, b = campaign({"discount_type": "percent", "discount_value": 10}, event_id=cancelled)
        t.check("no new codes for a cancelled event", s == 409 and b["error"] == "InvalidEventStatusError", f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
