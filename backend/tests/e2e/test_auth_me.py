"""GET /auth/me: who is logged in and which roles they have, in one call after login."""
import sys
from helpers import E2E

FIELDS = {"id", "email", "is_platform_admin", "organizer", "is_event_staff"}


def main() -> bool:
    with E2E("auth me") as t:
        s, _ = t.call("GET", "/auth/me")
        t.check("no token is rejected", s == 401, f"status {s}")
        s, _ = t.call("GET", "/auth/me", token="not-a-real-token")
        t.check("bad token is rejected", s == 401, f"status {s}")

        # a plain attendee
        user, email = t.new_user()
        s, me = t.call("GET", "/auth/me", token=user)
        t.check("attendee gets 200", s == 200, f"status {s}")
        t.check("only the agreed fields, no password hash", set(me) == FIELDS, str(sorted(me)))
        t.check("id and email are the logged-in user's",
                me["id"] == t.db_value("select id from users where email = :e", e=email) and me["email"] == email)
        t.check("attendee has no roles",
                me["is_platform_admin"] is False and me["organizer"] is None and me["is_event_staff"] is False)

        # applied but not approved yet
        pending, _ = t.new_user()
        t.call("POST", "/organizers/apply", token=pending)
        _, me = t.call("GET", "/auth/me", token=pending)
        t.check("applicant sees a pending organizer profile", (me["organizer"] or {}).get("status") == "pending")

        # approved organizer
        org, _ = t.new_user(organizer=True)
        _, me = t.call("GET", "/auth/me", token=org)
        t.check("approved organizer sees status approved",
                (me["organizer"] or {}).get("status") == "approved" and me["organizer"]["user_id"] == me["id"])
        t.check("organizing alone doesn't make you event staff", me["is_event_staff"] is False)

        # platform admin
        admin, _ = t.new_user(admin=True)
        _, me = t.call("GET", "/auth/me", token=admin)
        t.check("platform admin flag is true", me["is_platform_admin"] is True)

        # event staff: drafts don't count, the same rule as GET /staff/events
        staff, staff_email = t.new_user()
        draft = t.make_event(org, publish=False)
        s, _ = t.call("POST", f"/events/{draft}/staff", {"email": staff_email}, org)
        t.check("staff assigned to a draft event", s == 201, f"status {s}")
        _, me = t.call("GET", "/auth/me", token=staff)
        t.check("assignment to a draft doesn't count yet", me["is_event_staff"] is False)

        t.call("PATCH", f"/events/{draft}/publish", token=org)
        _, me = t.call("GET", "/auth/me", token=staff)
        t.check("counts once the event is published", me["is_event_staff"] is True)
        _, staff_events = t.call("GET", "/staff/events", token=staff)
        t.check("agrees with GET /staff/events", [e["id"] for e in staff_events] == [draft])

        staff_id = me["id"]
        s, _ = t.call("DELETE", f"/events/{draft}/staff/{staff_id}", token=org)
        _, me = t.call("GET", "/auth/me", token=staff)
        t.check("removing the assignment clears the flag", s == 204 and me["is_event_staff"] is False, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
