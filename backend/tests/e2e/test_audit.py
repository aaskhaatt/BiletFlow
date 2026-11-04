"""Feature 1B: every event/ticket-type action is saved and audit-logged in one transaction."""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("audit log") as t:
        org, email = t.new_user(organizer=True)
        uid = t.db_value("select id from users where email = :e", e=email)
        t.check("register + login + organizer apply were saved", uid is not None)

        eid = t.make_event(org, publish=False, title="Audit Jazz Night", capacity=200)
        t.call("PATCH", f"/events/{eid}", {"capacity": 150}, org)
        s, _ = t.call("PATCH", f"/events/{eid}/publish", token=org)
        t.check("publish", s == 200, f"status {s}")

        tt = t.make_ticket_type(org, eid, price=0, quantity=100)
        t.call("PATCH", f"/ticket-types/{tt}", {"quantity": 80}, org)
        t.call("PATCH", f"/ticket_types/{tt}/hide", token=org)
        t.call("PATCH", f"/ticket_types/{tt}/unhide", token=org)
        t.call("PATCH", f"/events/{eid}/unpublish", token=org)
        t.call("PATCH", f"/events/{eid}/publish", token=org)
        s, _ = t.call("PATCH", f"/events/{eid}/cancel", token=org)
        t.check("cancel", s == 200, f"status {s}")
        s, _ = t.call("PATCH", f"/events/{eid}/cancel", token=org)
        t.check("cancel twice is rejected", s == 409, f"status {s}")
        s, _ = t.call("PATCH", f"/events/{eid}/publish", token=org)
        t.check("failed action writes no log (publish cancelled)", s == 409, f"status {s}")

        rows = t.db_rows("select created_at, actor_user_id, action, description from audit_logs "
                         "where event_id = :e order by id", e=eid)
        expected = ["event.created", "event.updated", "event.published", "ticket_type.created", "ticket_type.updated",
                    "ticket_type.hidden", "ticket_type.unhidden", "event.unpublished", "event.published", "event.cancelled"]
        t.check("audit actions in the right order", [r.action for r in rows] == expected, f"{len(rows)} rows")
        t.check("every row has the right actor", all(r.actor_user_id == uid for r in rows))
        t.check("every row has a timezone-aware timestamp", all(r.created_at.tzinfo is not None for r in rows))
        t.check("capacity change is described", any("capacity 200 -> 150" in r.description for r in rows))
        t.check("quantity change is described", any("quantity 100 -> 80" in r.description for r in rows))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
