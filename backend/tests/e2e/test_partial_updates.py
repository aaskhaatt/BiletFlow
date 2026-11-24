"""PATCH semantics for events and ticket types: a field left out keeps its value, null clears an optional field,
and a field that must always have a value refuses null."""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("partial updates") as t:
        org, _ = t.new_user(organizer=True)
        eid = t.make_event(org, category="Music", capacity=100, refund_policy="Full refund up to 7 days before.")

        def patch(body, event_id=eid):
            return t.call("PATCH", f"/events/{event_id}", body, org)

        s, ev = patch({"category": None})
        t.check("null clears the category", s == 200 and ev["category"] is None, f"{s} {ev.get('category')}")
        t.check("...and nothing else changes", ev["title"] == "E2E event" and ev["capacity"] == 100
                and ev["refund_policy"] == "Full refund up to 7 days before.")
        s, ev = patch({"capacity": None, "refund_policy": None})
        t.check("null clears capacity (unlimited) and the refund policy", s == 200 and ev["capacity"] is None
                and ev["refund_policy"] is None, f"{s}")
        s, ev = patch({"category": "Jazz"})
        t.check("a field left out keeps its value", s == 200 and ev["category"] == "Jazz" and ev["capacity"] is None)
        s, before = t.call("GET", f"/events/{eid}")
        s, ev = patch({})
        t.check("an empty body changes nothing", s == 200 and {k: ev[k] for k in ("title", "category", "start_time")}
                == {k: before[k] for k in ("title", "category", "start_time")})

        for field in ("title", "start_time", "end_time", "visibility"):
            s, b = patch({field: None})
            t.check(f"{field} can't be null", s == 422 and b["error"] == "VALIDATION_ERROR", f"status {s}")

        s, b = patch({"venue_name": None})
        t.check("a published event can't lose its venue", s == 400 and b["error"] == "EventNotReadyToPublishError", f"status {s}")
        draft = t.make_event(org, publish=False)
        s, ev = patch({"venue_name": None, "venue_address": None}, event_id=draft)
        t.check("a draft can", s == 200 and ev["venue_name"] is None and ev["venue_address"] is None, f"status {s}")

        # ticket types follow the same rules
        tt = t.make_ticket_type(org, eid, name="Standard", price=5000)
        s, x = t.call("PATCH", f"/ticket-types/{tt}", {"description": "Seats in rows 1-10"}, org)
        s, x = t.call("PATCH", f"/ticket-types/{tt}", {"description": None}, org)
        t.check("ticket type: null clears the description", s == 200 and x["description"] is None and x["price"] == 5000,
                f"{s} {x.get('description')}")
        s, x = t.call("PATCH", f"/ticket-types/{tt}", {"quantity": 5}, org)
        t.check("ticket type: a field left out keeps its value", s == 200 and x["quantity"] == 5 and x["name"] == "Standard"
                and x["price"] == 5000)
        for field in ("name", "price", "quantity", "sales_start", "sales_end", "max_per_order"):
            s, b = t.call("PATCH", f"/ticket-types/{tt}", {field: None}, org)
            t.check(f"ticket type: {field} can't be null", s == 422, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
