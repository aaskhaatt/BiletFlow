"""Campaign QR codes (SRS 4.14): an opaque link per promo code, its PNG, opening it, counting opens."""
import sys
import threading
from helpers import E2E
from qr import make_campaign_qr_png, make_qr_png


def main() -> bool:
    with E2E("campaign QR") as t:
        (org, _), (other_org, _), (alice, _), (bob, _) = t.new_user(organizer=True), t.new_user(organizer=True), t.new_user(), t.new_user()
        eid = t.make_event(org)
        std = t.make_ticket_type(org, eid, name="Standard", price=10000)
        t.activate_paid_sales(org, eid)

        def campaign(code, **extra):
            return t.call("POST", f"/events/{eid}/campaigns",
                          {"name": "Poster", "code": code, "discount_type": "percent", "discount_value": 20, **extra}, org)[1]

        def open_link(token):
            return t.call("GET", f"/campaign-links/{token}")

        summer = campaign("SUMMER20")
        link = summer["link"]
        token = link.split("?campaign=")[-1]

        # --- the link ------------------------------------------------------------------------------
        t.check("the link opens the event page with a token", f"/events/{eid}?campaign=C-" in link, link)
        t.check("it reveals neither the code nor the discount", "SUMMER20" not in link and "percent" not in link)
        t.check("no opens yet", summer["link_opens"] == 0)
        other = campaign("WINTER")
        t.check("every campaign gets its own token", other["link"] != link)

        # --- the QR image --------------------------------------------------------------------------
        s, kind, png = t.call_raw("GET", f"/campaigns/{summer['id']}/qr", token=org)
        t.check("organizer gets a PNG", s == 200 and kind == "image/png" and png.startswith(b"\x89PNG"), f"status {s}")
        # the same text always gives the same PNG, so this proves the QR contains exactly the link
        t.check("the QR contains exactly the link", png == make_campaign_qr_png(link, "SUMMER20"))
        t.check("it doesn't look like a ticket QR (frame and caption)", png != make_qr_png(link) and len(png) > 0)
        s, b = t.call("GET", f"/campaigns/{summer['id']}/qr", token=other_org)
        t.check("another organizer can't get it", s == 403 and b["error"] == "EventAccessDeniedError", f"status {s}")
        s, b = t.call("GET", f"/campaigns/{summer['id']}/qr", token=alice)
        t.check("an attendee can't get it", s == 404 and b["error"] == "OrganizerNotFoundError", f"status {s}")
        s, _ = t.call("GET", f"/campaigns/{summer['id']}/qr")
        t.check("no login", s == 401, f"status {s}")

        # --- opening the link (public) -------------------------------------------------------------
        s, b = open_link(token)
        t.check("anyone can open it, no login", s == 200 and b == {"event_id": eid, "promo_code": "SUMMER20",
                                                                   "discount_type": "percent", "discount_value": 20}, f"{s} {b}")
        s, c = t.call("GET", f"/campaigns/{summer['id']}", token=org)
        t.check("the open is counted", c["link_opens"] == 1, f"opens {c['link_opens']}")

        # 10 people scanning the poster at once: every one counts
        threads = [threading.Thread(target=open_link, args=(token,)) for _ in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        s, c = t.call("GET", f"/campaigns/{summer['id']}", token=org)
        t.check("10 opens at once are all counted", c["link_opens"] == 11, f"opens {c['link_opens']}")

        s, b = open_link("C-doesnotexist")
        t.check("unknown token", s == 404 and b["error"] == "CampaignLinkNotFoundError", f"status {s}")

        # the code from the link works at checkout
        s, b = open_link(token)
        s, o = t.call("POST", f"/events/{eid}/orders", {"buyer_name": "Alice", "promo_code": b["promo_code"],
                                                        "items": [{"ticket_type_id": std, "quantity": 1}]}, alice)
        t.check("ordering with the code from the link", s == 201 and o["discount_amount"] == 2000, f"{s} {o.get('discount_amount')}")

        # --- a code that can't be used still opens the event, without a discount ---------------------
        t.call("PATCH", f"/campaigns/{summer['id']}", {"is_active": False}, org)
        s, b = open_link(token)
        t.check("switched off: event shown, no discount", s == 200 and b["event_id"] == eid and b["promo_code"] is None
                and b["discount_value"] is None, f"{s} {b}")
        single = campaign("ONCE", max_redemptions=1)
        single_token = single["link"].split("?campaign=")[-1]
        t.call("POST", f"/events/{eid}/orders", {"buyer_name": "Bob", "promo_code": "ONCE",
                                                 "items": [{"ticket_type_id": std, "quantity": 1}]}, bob)
        s, b = open_link(single_token)
        t.check("used up: event shown, no discount", s == 200 and b["promo_code"] is None, f"{s} {b}")

        # --- hidden events stay hidden -------------------------------------------------------------
        t.call("PATCH", f"/events/{eid}", {"visibility": "private"}, org)
        s, b = open_link(other["link"].split("?campaign=")[-1])
        t.check("private event: 404", s == 404 and b["error"] == "CampaignLinkNotFoundError", f"status {s}")
        t.call("PATCH", f"/events/{eid}", {"visibility": "unlisted"}, org)
        s, _ = open_link(other["link"].split("?campaign=")[-1])
        t.check("unlisted event: reachable by the link", s == 200, f"status {s}")

        # --- a Campaign QR is never a ticket -------------------------------------------------------
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": token}, org)
        t.check("scanning the campaign token admits nobody", s == 200 and r["result"] == "invalid", f"{s} {r.get('result')}")
        s, r = t.call("POST", f"/events/{eid}/check-in", {"code": link}, org)
        t.check("scanning the whole link admits nobody", s == 200 and r["result"] == "invalid", f"{s} {r.get('result')}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
