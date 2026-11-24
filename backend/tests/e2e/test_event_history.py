"""Event history timeline, lifecycle labels and duplicating an event (SRS 4.16)."""
import json
import secrets
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from urllib.parse import urlencode
from helpers import E2E, BASE, NOW, iso, engine
from sqlalchemy import text

PNG = b"\x89PNG\r\n\x1a\n" + secrets.token_bytes(64)


def upload_image(token: str, event_id: int):
    boundary = "----e2e" + secrets.token_hex(8)
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"c.png\"\r\n"
            f"Content-Type: image/png\r\n\r\n").encode() + PNG + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(f"{BASE}/events/{event_id}/image", data=body, method="PUT")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"null")


def download_status(url: str) -> int:
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main() -> bool:
    with E2E("event history") as t:
        (org, org_email), (other_org, _), (alice, alice_email) = t.new_user(organizer=True), t.new_user(organizer=True), t.new_user()

        # --- the timeline ---------------------------------------------------------------------------
        eid = t.make_event(org)                                                  # event.created, event.published
        tt = t.make_ticket_type(org, eid, name="Standard")                       # ticket_type.created
        t.call("PATCH", f"/ticket-types/{tt}", {"quantity": 20}, org)            # ticket_type.updated
        s, order = t.order(alice, eid, [(tt, 1)])                                # order.created (by alice)
        t.call("POST", f"/events/{eid}/check-in", {"code": order["tickets"][0]["code"]}, org)  # ticket.checked_in

        def history(token=org, event_id=eid, **params):
            query = ("?" + urlencode(params)) if params else ""
            return t.call("GET", f"/events/{event_id}/history{query}", token=token)

        s, h = history()
        actions = [x["action"] for x in h["items"]]
        t.check("timeline: every action, newest first", s == 200 and actions == [
            "ticket.checked_in", "order.created", "ticket_type.updated", "ticket_type.created", "event.published",
            "event.created"] and h["total"] == 6, f"{s} {actions}")
        first = h["items"][-1]
        t.check("each row says who did it", first["actor_email"] == org_email
                and h["items"][1]["actor_email"] == alice_email, f"{first['actor_email']}")
        t.check("and its type", [x["type"] for x in h["items"]][:3] == ["ticket", "order", "ticket_type"])
        s, h = history(type="ticket_type")
        t.check("type=ticket_type", [x["action"] for x in h["items"]] == ["ticket_type.updated", "ticket_type.created"])
        s, h = history(type="ticket")
        t.check("type=ticket doesn't also match ticket_type", [x["action"] for x in h["items"]] == ["ticket.checked_in"],
                f"{[x['action'] for x in h['items']]}")
        s, h = history(action="order.created")
        t.check("one exact action", h["total"] == 1 and h["items"][0]["entity_id"] == order["id"])
        s, h = history(limit=2)
        s2, h2 = history(limit=2, offset=2)
        t.check("paging: same total, next rows", len(h["items"]) == 2 and h["total"] == 6 and h2["total"] == 6
                and h2["items"][0]["action"] == "ticket_type.updated")
        s, h = history(date_from=iso(NOW + timedelta(days=1)))
        t.check("date_from in the future: nothing", s == 200 and h["total"] == 0)
        s, h = history(date_to=iso(NOW - timedelta(days=1)))
        t.check("date_to in the past: nothing", s == 200 and h["total"] == 0)

        # an automatic action has no actor: a checkout that expires
        paid_tt = t.make_ticket_type(org, eid, name="Paid", price=5000)
        t.activate_paid_sales(org, eid)  # the checklist needs a paid ticket type to exist
        s, pending = t.order(alice, eid, [(paid_tt, 1)])
        with engine.begin() as conn:
            conn.execute(text("update orders set expires_at = now() - interval '1 minute' where id = :i"), {"i": pending["id"]})
        t.order(alice, eid, [(tt, 1)])  # a new order releases expired holds first
        s, h = history(action="order.expired")
        t.check("automatic actions: no actor", h["total"] == 1 and h["items"][0]["actor_email"] is None
                and h["items"][0]["actor_user_id"] is None, f"{h['items']}")

        s, b = history(token=other_org)
        t.check("another organizer is refused", s == 403 and b["error"] == "EventAccessDeniedError", f"status {s}")
        s, b = history(token=alice)
        t.check("an attendee is refused", s == 404 and b["error"] == "OrganizerNotFoundError", f"status {s}")
        s, _ = t.call("GET", f"/events/{eid}/history")
        t.check("no login", s == 401, f"status {s}")
        s, _ = history(type="Order!")
        t.check("a type with odd characters", s == 422, f"status {s}")

        # --- lifecycle --------------------------------------------------------------------------------
        def window(start_days, hours=3):
            start = NOW + timedelta(days=start_days)
            return {"start_time": iso(start), "end_time": iso(start + timedelta(hours=hours))}

        draft = t.make_event(org, publish=False)
        upcoming = eid  # starts in 7 days
        active = t.make_event(org, start_time=iso(NOW - timedelta(hours=1)), end_time=iso(NOW + timedelta(hours=2)))
        completed = t.make_event(org, **window(-3))
        cancelled = t.make_event(org)
        t.call("PATCH", f"/events/{cancelled}/cancel", token=org)

        s, mine = t.call("GET", "/events/me", token=org)
        labels = {e["id"]: e["lifecycle"] for e in mine}
        t.check("lifecycle on every event", (labels[draft], labels[upcoming], labels[active], labels[completed],
                labels[cancelled]) == ("draft", "upcoming", "active", "completed", "cancelled"), f"{labels}")
        for name, expected in [("active", active), ("completed", completed), ("draft", draft), ("cancelled", cancelled)]:
            s, mine = t.call("GET", f"/events/me?lifecycle={name}", token=org)
            t.check(f"filter lifecycle={name}", s == 200 and [e["id"] for e in mine] == [expected], f"{[e['id'] for e in mine]}")
        s, mine = t.call("GET", "/events/me?lifecycle=upcoming", token=org)
        t.check("filter lifecycle=upcoming", upcoming in [e["id"] for e in mine] and draft not in [e["id"] for e in mine])
        s, ev = t.call("GET", f"/events/{active}")
        t.check("the public event page has it too", s == 200 and ev["lifecycle"] == "active")
        s, _ = t.call("GET", "/events/me?lifecycle=soon", token=org)
        t.check("unknown lifecycle", s == 422, f"status {s}")

        # --- duplicate ----------------------------------------------------------------------------------
        src = t.make_event(org, title="Jazz night", category="Music", capacity=300, refund_policy="Full refund 7 days before",
                           registration_closes_at=iso(NOW + timedelta(days=7, hours=1)))
        std = t.make_ticket_type(org, src, name="Standard", quantity=100)
        vip = t.make_ticket_type(org, src, name="VIP", quantity=5)
        t.call("PATCH", f"/ticket_types/{vip}/hide", token=org)
        t.order(alice, src, [(std, 2)])
        t.call("POST", f"/events/{src}/staff", {"email": alice_email}, org)
        s, _ = upload_image(org, src)
        has_storage = s == 200
        s, source = t.call("GET", f"/events/{src}", token=org)

        s, copy = t.call("POST", f"/events/{src}/duplicate", token=org)
        t.event_ids.append(copy["id"]) if s == 201 else None
        t.check("duplicate: a new draft", s == 201 and copy["id"] != src and copy["status"] == "draft"
                and copy["lifecycle"] == "draft", f"status {s}")
        same = ["title", "description", "category", "venue_name", "venue_address", "capacity", "visibility",
                "start_time", "end_time", "registration_opens_at", "registration_closes_at", "refund_policy"]
        t.check("same details", all(copy[f] == source[f] for f in same), f"{[f for f in same if copy[f] != source[f]]}")
        s, types = t.call("GET", f"/events/{copy['id']}/ticket-types/manage", token=org)
        t.check("same ticket types, hidden one stays hidden, nothing sold",
                [(x["name"], x["quantity"], x["is_hidden"], x["sold_count"]) for x in types]
                == [("Standard", 100, False, 0), ("VIP", 5, True, 0)], f"{types}")
        s, attendees = t.call("GET", f"/events/{copy['id']}/attendees", token=org)
        s2, staff = t.call("GET", f"/events/{copy['id']}/staff", token=org)
        t.check("no orders and no staff copied", attendees == [] and staff == [], f"{attendees} {staff}")
        s, h = history(event_id=copy["id"])
        t.check("the copy's history starts with 'created as a copy'", h["total"] == 1 and h["items"][0]["action"] == "event.created"
                and f"event #{src}" in h["items"][0]["description"], f"{h['items']}")
        s, h = history(event_id=src, action="event.duplicated")
        t.check("the original's history notes the copy", h["total"] == 1 and f"event #{copy['id']}" in h["items"][0]["description"])

        if has_storage:
            t.check("the image is copied, not shared", copy["image_url"] and copy["image_url"] != source["image_url"]
                    and download_status(copy["image_url"]) == 200)
            t.call("DELETE", f"/events/{copy['id']}/image", token=org)
            t.check("removing the copy's image leaves the original's", download_status(source["image_url"]) == 200)
            t.call("DELETE", f"/events/{src}/image", token=org)
        else:
            print("SKIP  image copy checks: storage not configured")

        # a new date moves everything by the same amount
        new_start = datetime.fromisoformat(source["start_time"]) + timedelta(days=30)
        s, moved = t.call("POST", f"/events/{src}/duplicate", {"title": "Jazz night II", "start_time": iso(new_start)}, org)
        t.event_ids.append(moved["id"]) if s == 201 else None
        shifted = lambda value: (datetime.fromisoformat(value) + timedelta(days=30)).isoformat()
        t.check("new title and start; end and registration move along",
                s == 201 and moved["title"] == "Jazz night II"
                and datetime.fromisoformat(moved["start_time"]) == new_start
                and datetime.fromisoformat(moved["end_time"]) == datetime.fromisoformat(shifted(source["end_time"]))
                and datetime.fromisoformat(moved["registration_closes_at"]) == datetime.fromisoformat(shifted(source["registration_closes_at"])),
                f"status {s}")
        s, src_types = t.call("GET", f"/events/{src}/ticket-types/manage", token=org)
        s, moved_types = t.call("GET", f"/events/{moved['id']}/ticket-types/manage", token=org)
        t.check("ticket sales windows move along too", all(
            datetime.fromisoformat(b["sales_end"]) - datetime.fromisoformat(a["sales_end"]) == timedelta(days=30)
            for a, b in zip(src_types, moved_types)))

        s, b = t.call("POST", f"/events/{src}/duplicate", token=other_org)
        t.check("another organizer can't duplicate it", s == 403, f"status {s}")
        s, b = t.call("POST", f"/events/{src}/duplicate", token=alice)
        t.check("an attendee can't", s == 404, f"status {s}")
        s, again = t.call("POST", f"/events/{cancelled}/duplicate", token=org)
        t.event_ids.append(again["id"]) if s == 201 else None
        t.check("a cancelled event can be reused as a new draft", s == 201 and again["status"] == "draft", f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
