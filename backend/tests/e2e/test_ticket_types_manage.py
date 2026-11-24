"""The organizer's ticket-type list: hidden types and draft events included, owner only."""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("ticket types manage") as t:
        (org, _), (other_org, _), (attendee, _) = t.new_user(organizer=True), t.new_user(organizer=True), t.new_user()

        eid = t.make_event(org, publish=False)
        standard = t.make_ticket_type(org, eid, name="Standard")
        vip = t.make_ticket_type(org, eid, name="VIP", price=10000)
        t.call("PATCH", f"/ticket_types/{vip}/hide", token=org)

        # while the event is a draft
        s, _ = t.call("GET", f"/events/{eid}/ticket-types")
        t.check("draft: the public list still answers 404", s == 404, f"status {s}")
        s, types = t.call("GET", f"/events/{eid}/ticket-types/manage", token=org)
        t.check("draft: the organizer sees all ticket types", s == 200 and [x["id"] for x in types] == [standard, vip], f"status {s}")
        t.check("hidden ones are included and marked", [x["is_hidden"] for x in types] == [False, True])

        # once it's published
        t.call("PATCH", f"/events/{eid}/publish", token=org)
        s, public = t.call("GET", f"/events/{eid}/ticket-types")
        t.check("published: the public list leaves the hidden one out", s == 200 and [x["id"] for x in public] == [standard])
        s, types = t.call("GET", f"/events/{eid}/ticket-types/manage", token=org)
        t.check("published: the organizer still sees both", [x["id"] for x in types] == [standard, vip])

        # after unhiding, both lists agree
        t.call("PATCH", f"/ticket_types/{vip}/unhide", token=org)
        s, public = t.call("GET", f"/events/{eid}/ticket-types")
        t.check("unhidden: back in the public list", [x["id"] for x in public] == [standard, vip])

        # who may call it
        s, b = t.call("GET", f"/events/{eid}/ticket-types/manage", token=other_org)
        t.check("another organizer is refused", s == 403 and b["error"] == "EventAccessDeniedError", f"{s} {b and b.get('error')}")
        s, b = t.call("GET", f"/events/{eid}/ticket-types/manage", token=attendee)
        t.check("a user who isn't an organizer is refused", s == 404 and b["error"] == "OrganizerNotFoundError", f"{s} {b and b.get('error')}")
        s, _ = t.call("GET", f"/events/{eid}/ticket-types/manage")
        t.check("no login is refused", s == 401, f"status {s}")
        s, b = t.call("GET", "/events/99999999/ticket-types/manage", token=org)
        t.check("unknown event", s == 404 and b["error"] == "EventNotFoundError", f"{s} {b and b.get('error')}")

        # a cancelled event keeps its history visible to the organizer
        t.call("PATCH", f"/events/{eid}/cancel", token=org)
        s, types = t.call("GET", f"/events/{eid}/ticket-types/manage", token=org)
        t.check("cancelled: the organizer still sees the ticket types", s == 200 and len(types) == 2, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
