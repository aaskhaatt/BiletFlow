"""Fixes from the web team's questions: state guards (unpublish, cancel, edit after cancel), ticket availability,
the public page of a cancelled event, event details in orders, organizer names, catalogue prices, the organizer
summary, who checked a ticket in, organizer rejection, support case history, change password, the admin audit log."""
import secrets
import sys
from datetime import timedelta
from sqlalchemy import text
from helpers import E2E, NOW, engine, iso


def err(body):
    return (body or {}).get("error")


def main() -> bool:
    with E2E("integration fixes") as t:
        (org, _), (alice, alice_email), (admin, admin_email) = (t.new_user(organizer=True), t.new_user(),
                                                                t.new_user(admin=True))
        tag = secrets.token_hex(4)

        # --- organizer public name -----------------------------------------------------------------------------
        s, profile = t.call("PATCH", "/organizers/me", {"display_name": "Dala Events"}, org)
        t.check("organizer sets a display name", s == 200 and profile["display_name"] == "Dala Events", f"status {s}")
        s, body = t.call("PATCH", "/organizers/me", {"display_name": "x"}, org)
        t.check("too short a name: 422", s == 422, f"status {s}")

        # --- ticket availability ---------------------------------------------------------------------------------
        eid = t.make_event(org, title=f"Integration {tag}", capacity=5)
        free = t.make_ticket_type(org, eid, name="Free", quantity=10, max_per_order=3)
        paid = t.make_ticket_type(org, eid, name="Paid", quantity=10, price=5000)
        later = t.make_ticket_type(org, eid, name="Later", quantity=10, sales_start=NOW + timedelta(days=2))

        s, types = t.call("GET", f"/events/{eid}/ticket-types")
        by_name = {x["name"]: x for x in types}
        t.check("free type is on sale, capped by the event capacity",
                s == 200 and by_name["Free"]["on_sale"] and by_name["Free"]["available"] == 5
                and by_name["Free"]["max_now"] == 3 and by_name["Free"]["unavailable_reason"] is None, str(by_name.get("Free")))
        t.check("paid type without activation: paid_sales_inactive",
                not by_name["Paid"]["on_sale"] and by_name["Paid"]["unavailable_reason"] == "paid_sales_inactive"
                and by_name["Paid"]["max_now"] == 0)
        t.check("future sales start: not_started", by_name["Later"]["unavailable_reason"] == "not_started")

        # --- catalogue numbers and organizer name -----------------------------------------------------------------
        s, page = t.call("GET", f"/events?q=Integration%20{tag}")
        item = page["items"][0] if s == 200 and page["items"] else {}
        t.check("catalogue: cheapest visible price", item.get("min_price") == 0, str(item.get("min_price")))
        t.check("catalogue: tickets left, capped by capacity", item.get("tickets_remaining") == 5, str(item.get("tickets_remaining")))
        t.check("catalogue: organizer name", item.get("organizer_name") == "Dala Events", str(item.get("organizer_name")))
        t.check("catalogue: published_at is set", item.get("published_at") is not None)

        # --- orders carry their event -----------------------------------------------------------------------------
        s, order = t.order(alice, eid, [(free, 2)])
        t.check("order response has the event summary", s == 201 and order["event"]["id"] == eid
                and order["event"]["title"] == f"Integration {tag}" and order["event"]["venue_name"] == "Barys Arena",
                f"status {s}")
        s, mine = t.call("GET", "/orders/me", token=alice)
        t.check("my orders include the event", s == 200 and mine[0]["event"]["id"] == eid, f"status {s}")
        s, types = t.call("GET", f"/events/{eid}/ticket-types")
        t.check("availability drops after an order", {x["name"]: x for x in types}["Free"]["available"] == 3)

        # --- who checked a ticket in -------------------------------------------------------------------------------
        first = order["tickets"][0]
        s, scan = t.call("POST", f"/events/{eid}/check-in", {"code": first["code"]}, org)
        t.check("scan result names who checked it in", s == 200 and scan["ticket"]["checked_in_by"] is not None
                and scan["ticket"]["checked_in_at"] is not None, f"status {s}")
        s, attendees = t.call("GET", f"/events/{eid}/attendees", token=org)
        row = next((a for a in attendees if a["ticket_id"] == first["id"]), {}) if s == 200 else {}
        other = next((a for a in attendees if a["ticket_id"] != first["id"]), {}) if s == 200 else {}
        t.check("attendee list: checked_in_at and checked_in_by", row.get("checked_in_at") is not None
                and row.get("checked_in_by") == scan["ticket"]["checked_in_by"])
        t.check("attendee list: not scanned = null", other.get("checked_in_by") is None and other.get("checked_in_at") is None)

        # --- B3: a used registration can't be cancelled ------------------------------------------------------------
        s, body = t.call("POST", f"/orders/{order['id']}/cancel", {}, alice)
        t.check("cancel after a ticket was scanned: 409", s == 409 and err(body) == "OrderNotCancellableError", f"status {s}")

        # --- B1: unpublish with tickets sold ----------------------------------------------------------------------
        s, body = t.call("PATCH", f"/events/{eid}/unpublish", token=org)
        t.check("unpublish with tickets: 409", s == 409 and err(body) == "EventHasTicketsError", f"status {s}")
        empty = t.make_event(org, title=f"Empty {tag}")
        s, body = t.call("PATCH", f"/events/{empty}/unpublish", token=org)
        t.check("unpublish without tickets still works", s == 200 and body["status"] == "draft", f"status {s}")

        # --- organizer summary --------------------------------------------------------------------------------------
        s, summary = t.call("GET", "/events/me/summary", token=org)
        row = next((x for x in summary if x["event_id"] == eid), {}) if s == 200 else {}
        t.check("summary: tickets sold, revenue, paid-sales status", row.get("tickets_sold") == 2 and row.get("revenue") == 0
                and row.get("paid_sales_status") == "not_started", str(row))
        s, _ = t.call("GET", "/events/me/summary", token=alice)
        t.check("summary: non-organizer refused", s == 404, f"status {s}")

        # --- D2 + B4 + B5: a cancelled event --------------------------------------------------------------------------
        s, _ = t.call("PATCH", f"/events/{eid}/cancel", token=org)
        s, page_ = t.call("GET", f"/events/{eid}")
        t.check("cancelled event page stays public", s == 200 and page_["status"] == "cancelled"
                and page_["cancelled_at"] is not None, f"status {s}")
        s, types = t.call("GET", f"/events/{eid}/ticket-types")
        t.check("cancelled: types say registration_closed", s == 200 and all(
            x["unavailable_reason"] == "registration_closed" for x in types), f"status {s}")
        s, mine = t.call("GET", "/orders/me", token=alice)
        t.check("my order shows the event as cancelled", mine[0]["event"]["status"] == "cancelled"
                and mine[0]["event"]["cancelled_at"] is not None)
        s, body = t.call("PATCH", f"/events/{eid}", {"title": "Renamed"}, org)
        t.check("cancelled event can't be edited", s == 409 and err(body) == "InvalidEventStatusError", f"status {s}")
        s, body = t.call("POST", f"/events/{eid}/ticket-type", {"name": "New", "price": 0, "quantity": 5,
                         "sales_start": iso(NOW), "sales_end": iso(NOW + timedelta(days=3))}, org)
        t.check("no new ticket types on a cancelled event", s == 409 and err(body) == "InvalidEventStatusError", f"status {s}")
        s, body = t.call("PATCH", f"/ticket_types/{free}/hide", token=org)
        t.check("no hiding ticket types on a cancelled event", s == 409, f"status {s}")
        draft = t.make_event(org, publish=False, title=f"Draft {tag}")
        t.call("PATCH", f"/events/{draft}/cancel", token=org)
        s, _ = t.call("GET", f"/events/{draft}")
        t.check("a never-published cancelled event stays hidden", s == 404, f"status {s}")

        # --- B2 + B3: after the event ------------------------------------------------------------------------------
        past = t.make_event(org, title=f"Past {tag}")
        past_type = t.make_ticket_type(org, past)
        s, past_order = t.order(alice, past, [(past_type, 1)])
        with engine.begin() as c:
            c.execute(text("update events set start_time = now() - interval '3 hours', "
                             "end_time = now() - interval '1 hour' where id = :i"), {"i": past})
        s, body = t.call("PATCH", f"/events/{past}/cancel", token=org)
        t.check("an ended event can't be cancelled", s == 409 and err(body) == "EventAlreadyEndedError", f"status {s}")
        s, body = t.call("POST", f"/orders/{past_order['id']}/cancel", {}, alice)
        t.check("registration for an ended event can't be cancelled", s == 409, f"status {s}")

        # --- organizer rejection and re-applying ----------------------------------------------------------------------
        applicant, applicant_email = t.new_user()
        s, applied = t.call("POST", "/organizers/apply", {"display_name": "Nomad Shows"}, applicant)
        t.check("apply with a display name", s == 200 and applied["status"] == "pending"
                and applied["display_name"] == "Nomad Shows", f"status {s}")
        s, page = t.call("GET", f"/admin/organizers?status=pending&q={applicant_email}", token=admin)
        t.check("admin lists pending applications with email", s == 200 and page["total"] == 1
                and page["items"][0]["email"] == applicant_email, f"status {s}")
        s, _ = t.call("GET", "/admin/organizers", token=alice)
        t.check("organizer list: admins only", s == 403, f"status {s}")
        uid = applied["user_id"]
        s, rejected = t.call("POST", f"/admin/organizers/{uid}/reject", {"reason": "Please add a phone number"}, admin)
        t.check("admin rejects with a reason", s == 200 and rejected["status"] == "rejected"
                and rejected["rejection_reason"] == "Please add a phone number", f"status {s}")
        s, me = t.call("GET", "/auth/me", token=applicant)
        t.check("applicant sees the rejection in /auth/me", me["organizer"]["status"] == "rejected"
                and me["organizer"]["rejection_reason"] == "Please add a phone number")
        s, body = t.call("POST", f"/admin/organizers/{uid}/reject", {"reason": "Again"}, admin)
        t.check("only pending applications can be rejected", s == 409 and err(body) == "InvalidOrganizerStatusError", f"status {s}")
        s, again = t.call("POST", "/organizers/apply", token=applicant)
        t.check("re-applying goes back to pending", s == 200 and again["status"] == "pending"
                and again["rejection_reason"] is None, f"status {s}")
        s, body = t.call("POST", "/organizers/apply", token=applicant)
        t.check("applying twice while pending: 409", s == 409, f"status {s}")
        s, _, csv_ = t.call_raw("GET", f"/admin/organizers?format=csv&q={applicant_email}", token=admin)
        t.check("organizer list exports CSV", s == 200 and applicant_email.encode() in csv_, f"status {s}")

        # --- support case history ----------------------------------------------------------------------------------
        s, case = t.call("POST", "/support/cases", {"kind": "platform", "category": "account", "subject": f"Help: {tag}",
                                                    "message": "Cannot log in"}, org)
        t.call("PATCH", f"/support/cases/{case['id']}/assignee", {"user_id": None}, admin)
        t.call("PATCH", f"/support/cases/{case['id']}/status", {"status": "in_progress"}, admin)
        t.call("PATCH", f"/support/cases/{case['id']}/status", {"status": "resolved"}, admin)
        s, detail = t.call("GET", f"/support/cases/{case['id']}", token=org)
        history = detail.get("history", []) if s == 200 else []
        t.check("support case history, oldest first", [h["action"] for h in history] == ["assigned", "status_changed",
                                                                                          "status_changed"], str(history))
        t.check("status steps parsed (subject with ': ' inside)", [(h["from_status"], h["to_status"]) for h in history[1:]]
                == [("open", "in_progress"), ("in_progress", "resolved")])

        # --- change password ----------------------------------------------------------------------------------------
        email, password = f"e2e-{secrets.token_hex(4)}@example.com", "first-pass-1"
        t.emails.append(email)
        t.call("POST", "/auth/register", {"email": email, "password": password})
        _, other_device = t.call("POST", "/auth/login", {"email": email, "password": password})
        _, tokens = t.call("POST", "/auth/login", {"email": email, "password": password})
        s, body = t.call("POST", "/auth/change-password", {"current_password": "wrong", "new_password": "second-pass-2"},
                         tokens["access_token"])
        t.check("wrong current password: 400", s == 400 and err(body) == "CurrentPasswordIncorrectError", f"status {s}")
        s, new_tokens = t.call("POST", "/auth/change-password", {"current_password": password,
                                                                  "new_password": "second-pass-2"}, tokens["access_token"])
        t.check("password changed, fresh tokens returned", s == 200 and new_tokens.get("refresh_token"), f"status {s}")
        s, _ = t.call("POST", "/auth/refresh", {"refresh_token": other_device["refresh_token"]})
        t.check("other devices are signed out", s == 401, f"status {s}")
        s, _ = t.call("POST", "/auth/refresh", {"refresh_token": new_tokens["refresh_token"]})
        t.check("this device stays signed in", s == 200, f"status {s}")
        s, _ = t.call("POST", "/auth/login", {"email": email, "password": "second-pass-2"})
        t.check("new password works", s == 200, f"status {s}")

        # --- admin audit log ---------------------------------------------------------------------------------------
        s, log = t.call("GET", f"/admin/audit-log?action=organizer.rejected&entity_id={rejected['id']}", token=admin)
        t.check("admin audit log finds the rejection", s == 200 and log["total"] == 1
                and log["items"][0]["actor_email"] == admin_email, f"status {s}")
        s, log = t.call("GET", f"/admin/audit-log?type=event&event_id={eid}&limit=200", token=admin)
        t.check("audit log by type and event", s == 200 and {"event.published", "event.cancelled"}
                <= {x["action"] for x in log["items"]}, f"status {s}")
        s, _ = t.call("GET", "/admin/audit-log", token=org)
        t.check("audit log: admins only", s == 403, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
