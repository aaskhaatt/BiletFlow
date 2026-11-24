"""SRS gaps closed together: the organizer's order list with payment and refund records, attendee names per ticket,
refunded and checked-in counts per ticket type, absent ticket holders, previewing a draft, and admins reading history."""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("organizer records") as t:
        (org, _), (other_org, _), (admin, _), (alice, alice_email), (bob, bob_email) = (
            t.new_user(organizer=True), t.new_user(organizer=True), t.new_user(admin=True), t.new_user(), t.new_user())
        eid = t.make_event(org, title="Records Night")
        free = t.make_ticket_type(org, eid, name="Free", price=0)
        paid = t.make_ticket_type(org, eid, name="Paid", price=10000)
        t.activate_paid_sales(org, eid)
        t.call("POST", f"/events/{eid}/campaigns", {"name": "P", "code": "TEN", "discount_type": "percent",
                                                     "discount_value": 10}, org)

        def order(token, items, code=None):
            body = {"buyer_name": "Buyer Name", "items": items}
            if code:
                body["promo_code"] = code
            return t.call("POST", f"/events/{eid}/orders", body, token)

        # --- attendee names per ticket (SRS 4.6, 4.7) -------------------------------------------------------
        s, o = order(alice, [{"ticket_type_id": free, "quantity": 3, "attendee_names": ["Aida", "  Bauyrzhan  "]}])
        names = sorted(ticket["attendee_name"] for ticket in o["tickets"])
        t.check("each ticket gets its own name; missing ones use the buyer's", s == 201 and names
                == ["Aida", "Bauyrzhan", "Buyer Name"], f"{s} {names}")
        s, b = order(alice, [{"ticket_type_id": free, "quantity": 1, "attendee_names": ["A", "B"]}])
        t.check("more names than tickets is refused", s == 422, f"status {s}")
        s, pending = order(bob, [{"ticket_type_id": paid, "quantity": 2, "attendee_names": ["Dana", "Erlan"]}], "TEN")
        t.check("a paid checkout has no tickets yet", s == 201 and pending["tickets"] == [], f"status {s}")
        s, paid_order = t.call("POST", f"/orders/{pending['id']}/pay", {}, bob)
        t.check("the names survive until payment issues the tickets",
                sorted(x["attendee_name"] for x in paid_order["tickets"]) == ["Dana", "Erlan"])
        s, refunded = order(bob, [{"ticket_type_id": paid, "quantity": 1}])
        t.call("POST", f"/orders/{refunded['id']}/pay", {}, bob)
        t.call("POST", f"/orders/{refunded['id']}/refund", {"reason": "Can't attend"}, org)
        t.call("POST", f"/events/{eid}/check-in", {"code": o["tickets"][0]["code"]}, org)
        t.call("POST", f"/events/{eid}/check-in", {"code": paid_order["tickets"][0]["code"]}, org)

        # --- the organizer's order list with payment and refund records (success criterion) ----------------
        s, page = t.call("GET", f"/events/{eid}/orders", token=org)
        by_id = {x["id"]: x for x in page["items"]}
        t.check("all 3 orders, newest first", s == 200 and page["total"] == 3
                and [x["id"] for x in page["items"]] == sorted(by_id, reverse=True), f"{s} {page.get('total')}")
        p = by_id[paid_order["id"]]
        t.check("a paid order: amount, discount, code, fee, tickets and the payment reference",
                (p["status"], p["total_amount"], p["discount_amount"], p["promo_code"], p["processing_fee"], p["tickets"])
                == ("confirmed", 18000, 2000, "TEN", 540, 2) and p["payment_reference"].startswith("SIM-")
                and p["refund"] is None and p["is_simulated"] is True, f"{p}")
        r = by_id[refunded["id"]]
        t.check("a refunded order shows the refund: amount, reason, reference", r["status"] == "refunded"
                and r["refund"]["amount"] == 10000 and r["refund"]["reason"] == "Can't attend"
                and r["refund"]["provider_reference"].startswith("SIM-R-"), f"{r['refund']}")
        f = by_id[o["id"]]
        t.check("a free registration: no payment, 3 tickets", f["payment_reference"] is None and f["tickets"] == 3
                and f["total_amount"] == 0)
        s, page = t.call("GET", f"/events/{eid}/orders?status=refunded", token=org)
        t.check("filter by status", [x["id"] for x in page["items"]] == [refunded["id"]])
        s, page = t.call("GET", f"/events/{eid}/orders?q={bob_email.split('@')[0].upper()}", token=org)
        t.check("search by buyer email (not case-sensitive)", page["total"] == 2, f"{page['total']}")
        s, page = t.call("GET", f"/events/{eid}/orders?limit=1&offset=1", token=org)
        t.check("paging", len(page["items"]) == 1 and page["total"] == 3)
        s, b = t.call("GET", f"/events/{eid}/orders", token=other_org)
        t.check("another organizer is refused", s == 403, f"status {s}")
        s, b = t.call("GET", f"/events/{eid}/orders", token=alice)
        t.check("an attendee is refused", s == 404, f"status {s}")

        # --- refunded and checked-in per ticket type (SRS 4.3) ---------------------------------------------
        s, sales = t.call("GET", f"/events/{eid}/sales", token=org)
        types = {x["name"]: x for x in sales["ticket_types"]}
        t.check("Paid: 2 sold, 1 refunded, 1 checked in", (types["Paid"]["sold"], types["Paid"]["refunded"],
                types["Paid"]["checked_in"]) == (2, 1, 1), f"{types['Paid']}")
        t.check("Free: 3 sold, 0 refunded, 1 checked in", (types["Free"]["sold"], types["Free"]["refunded"],
                types["Free"]["checked_in"]) == (3, 0, 1), f"{types['Free']}")

        # --- absent ticket holders (SRS 4.15) --------------------------------------------------------------
        s, a = t.call("GET", f"/events/{eid}/analytics", token=org)
        t.check("analytics: 5 valid tickets, 2 checked in, 3 absent", a["check_in"]["tickets"] == 5
                and a["check_in"]["checked_in"] == 2 and a["check_in"]["absent"] == 3, f"{a['check_in']}")

        # --- previewing a draft (SRS 4.2) ------------------------------------------------------------------
        draft = t.make_event(org, publish=False, title="Draft Preview")
        s, _ = t.call("GET", f"/events/{draft}")
        t.check("the public page hides the draft", s == 404, f"status {s}")
        s, ev = t.call("GET", f"/events/{draft}/manage", token=org)
        t.check("its organizer can preview it", s == 200 and ev["title"] == "Draft Preview" and ev["status"] == "draft",
                f"status {s}")
        s, _ = t.call("GET", f"/events/{draft}/manage", token=other_org)
        t.check("another organizer can't", s == 403, f"status {s}")

        # --- platform admins may read the history (SRS 4.16) -----------------------------------------------
        s, h = t.call("GET", f"/events/{eid}/history", token=admin)
        t.check("a platform admin reads the event history", s == 200 and h["total"] > 0, f"status {s}")
        s, _ = t.call("GET", f"/events/{eid}/history", token=other_org)
        t.check("another organizer still can't", s == 403, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
