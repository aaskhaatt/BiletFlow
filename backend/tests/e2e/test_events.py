"""Feature 1A: event fields, publishing rules, visibility, public event page."""
import sys
from datetime import timedelta
from helpers import E2E, EVENT_START, EVENT_END, iso


def main() -> bool:
    with E2E("events") as t:
        org, _ = t.new_user(organizer=True)

        s, ev = t.call("POST", "/events", {"title": "E2E concert", "start_time": iso(EVENT_START), "end_time": iso(EVENT_END)}, org)
        t.check("create draft without venue", s == 200, f"visibility={ev.get('visibility')}")
        eid = ev["id"]
        t.event_ids.append(eid)

        s, _ = t.call("POST", "/events", {"title": "bad", "start_time": iso(EVENT_START), "end_time": iso(EVENT_END),
                                          "registration_closes_at": iso(EVENT_END + timedelta(hours=1))}, org)
        t.check("create: registration closes after the event ends", s == 400, f"status {s}")
        s, _ = t.call("POST", "/events", {"title": "bad", "start_time": iso(EVENT_START), "end_time": iso(EVENT_END), "visibility": "secret"}, org)
        t.check("create: visibility='secret'", s == 422, f"status {s}")

        s, body = t.call("PATCH", f"/events/{eid}/publish", token=org)
        t.check("publish without venue", s == 400, body.get("error"))
        s, _ = t.call("PATCH", f"/events/{eid}", {"title": "E2E concert (renamed)"}, org)
        t.check("update only the title", s == 200, f"status {s}")
        s, _ = t.call("PATCH", f"/events/{eid}", {"venue_name": "Barys Arena", "venue_address": "Astana"}, org)
        t.check("add venue", s == 200, f"status {s}")
        s, body = t.call("PATCH", f"/events/{eid}/publish", token=org)
        t.check("publish with venue", s == 200 and body["status"] == "published", body.get("status"))
        s, body = t.call("PATCH", f"/events/{eid}/publish", token=org)
        t.check("publish again", s == 409, body.get("error"))

        s, _ = t.call("GET", f"/events/{eid}")
        t.check("public GET /events/{id}, no login", s == 200, f"status {s}")
        s, _ = t.call("GET", "/events/me", token=org)
        t.check("GET /events/me still works (route order)", s == 200, f"status {s}")
        # search by title, so other events in the database can't push this one off the first page
        s, page = t.call("GET", "/events?q=E2E+concert+%28renamed%29&limit=100")
        t.check("public list contains it", any(e["id"] == eid for e in page["items"]))

        t.call("PATCH", f"/events/{eid}", {"visibility": "unlisted"}, org)
        s, page = t.call("GET", "/events?q=E2E+concert+%28renamed%29&limit=100")
        t.check("unlisted: hidden from the public list", not any(e["id"] == eid for e in page["items"]))
        s, _ = t.call("GET", f"/events/{eid}")
        t.check("unlisted: still reachable by link", s == 200, f"status {s}")
        t.call("PATCH", f"/events/{eid}", {"visibility": "private"}, org)
        s, _ = t.call("GET", f"/events/{eid}")
        t.check("private: not reachable", s == 404, f"status {s}")

        tt = t.make_ticket_type(org, eid)
        t.check("create ticket type", isinstance(tt, int))

        s, body = t.call("PATCH", f"/events/{eid}/unpublish", token=org)
        t.check("unpublish", s == 200 and body["status"] == "draft", body.get("status"))
        s, _ = t.call("PATCH", f"/events/{eid}/unpublish", token=org)
        t.check("unpublish a draft", s == 409, f"status {s}")
        s, _ = t.call("GET", f"/events/{eid}")
        t.check("draft: not reachable publicly", s == 404, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
