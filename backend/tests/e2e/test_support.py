"""Feature 10: support cases (SRS 4.13).

Attendee cases are opened from an event, order or ticket and handled by the event's organizer.
Platform cases are opened by organizers and handled by platform admins. Admins can see every case.
Anyone else gets 404, so case ids reveal nothing.
"""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("support cases") as t:
        org, org_email = t.new_user(organizer=True)
        other_org, _ = t.new_user(organizer=True)
        attendee, attendee_email = t.new_user()
        stranger, _ = t.new_user()
        admin, admin_email = t.new_user(admin=True)

        def user_id(email):
            return t.db_value("select id from users where email = :e", e=email)

        def queued(email, template):
            return t.db_value("select count(*) from email_outbox where to_email = :e and template = :t",
                              e=email, t=template)

        event_id = t.make_event(org)
        other_event = t.make_event(other_org)
        draft_event = t.make_event(org, publish=False)
        ticket_type = t.make_ticket_type(org, event_id)
        _, order = t.order(attendee, event_id, [(ticket_type, 1)])
        ticket_id = order["tickets"][0]["id"]

        def open_case(token, **fields):
            body = {"kind": "attendee", "category": "ticket_delivery", "subject": "No QR code",
                    "message": "I can't find my ticket", **fields}
            return t.call("POST", "/support/cases", body, token)

        # 1. opening a case fills in the context automatically
        status, case = open_case(attendee, ticket_id=ticket_id)
        t.check("attendee opens a case from a ticket: 201", status == 201, status)
        t.check("order and event are filled in from the ticket",
                (case["event_id"], case["order_id"], case["ticket_id"]) == (event_id, order["id"], ticket_id), case)
        t.check("new case is open, unassigned, with the first message",
                case["status"] == "open" and case["assigned_user_id"] is None
                and [m["body"] for m in case["messages"]] == ["I can't find my ticket"])
        case_id = case["id"]

        status, from_order = open_case(attendee, order_id=order["id"], category="refund")
        t.check("from an order: event filled in, no ticket",
                status == 201 and from_order["event_id"] == event_id and from_order["ticket_id"] is None, status)
        status, from_event = open_case(attendee, event_id=event_id, category="event_information")
        t.check("from a public event page", status == 201 and from_event["order_id"] is None, status)

        # 2. bad requests
        status, _ = open_case(attendee)
        t.check("no event, order or ticket: 422", status == 422, status)
        status, _ = open_case(attendee, event_id=event_id, order_id=order["id"])
        t.check("two context ids at once: 422", status == 422, status)
        status, _ = open_case(attendee, event_id=event_id, category="activation")
        t.check("platform category on an attendee case: 422", status == 422, status)
        status, _ = open_case(stranger, order_id=order["id"])
        t.check("someone else's order: 404", status == 404, status)
        status, _ = open_case(stranger, ticket_id=ticket_id)
        t.check("someone else's ticket: 404", status == 404, status)
        status, _ = open_case(attendee, event_id=draft_event)
        t.check("draft event: 404", status == 404, status)

        # 3. who can read it
        for name, token, expected in [("requester", attendee, 200), ("event organizer", org, 200),
                                      ("platform admin", admin, 200), ("stranger", stranger, 404),
                                      ("another organizer", other_org, 404)]:
            status, _ = t.call("GET", f"/support/cases/{case_id}", token=token)
            t.check(f"{name} reads the case: {expected}", status == expected, status)

        # 4. the thread
        status, _ = t.call("POST", f"/support/cases/{case_id}/messages", {"body": "Check your spam folder"}, org)
        t.check("organizer replies: 201", status == 201, status)
        t.check("the attendee is emailed about the reply", queued(attendee_email, "support_message") == 1)
        t.call("POST", f"/support/cases/{case_id}/messages", {"body": "Found it, thanks"}, attendee)
        t.check("the organizer is emailed about the attendee's reply", queued(org_email, "support_message") == 1)
        _, case = t.call("GET", f"/support/cases/{case_id}", token=attendee)
        t.check("messages come back in order with their authors",
                [(m["author_user_id"], m["body"]) for m in case["messages"]] ==
                [(user_id(attendee_email), "I can't find my ticket"), (user_id(org_email), "Check your spam folder"),
                 (user_id(attendee_email), "Found it, thanks")])
        status, _ = t.call("POST", f"/support/cases/{case_id}/messages", {"body": "hi"}, stranger)
        t.check("stranger can't post: 404", status == 404, status)
        status, _ = t.call("POST", f"/support/cases/{case_id}/messages", {"body": "  "}, attendee)
        t.check("empty message: 422", status == 422, status)

        # 5. status
        status, body = t.call("PATCH", f"/support/cases/{case_id}/status", {"status": "resolved"}, attendee)
        t.check("requester can't change the status: 403", status == 403
                and body["error"] == "SupportCaseAccessDeniedError", status)
        status, case = t.call("PATCH", f"/support/cases/{case_id}/status", {"status": "waiting_for_customer"}, org)
        t.check("organizer sets Waiting for Customer", status == 200 and case["status"] == "waiting_for_customer", status)
        t.check("requester is emailed about the status", queued(attendee_email, "support_case_status_changed") == 1)
        t.check("status change is audit-logged", t.db_value(
            "select count(*) from audit_logs where action = 'support_case.status_changed' and entity_id = :i",
            i=case_id) == 1)
        status, _ = t.call("PATCH", f"/support/cases/{case_id}/status", {"status": "closed"}, org)
        t.check("unknown status: 422", status == 422, status)
        t.call("POST", f"/support/cases/{case_id}/messages", {"body": "Still a problem"}, attendee)
        _, case = t.call("GET", f"/support/cases/{case_id}", token=org)
        t.check("requester's reply reopens a waiting case", case["status"] == "open", case["status"])

        # 6. assignment
        status, _ = t.call("PATCH", f"/support/cases/{case_id}/assignee", {"user_id": user_id(admin_email)}, attendee)
        t.check("requester can't assign: 403", status == 403, status)
        status, body = t.call("PATCH", f"/support/cases/{case_id}/assignee", {"user_id": user_id(attendee_email)}, org)
        t.check("can't assign to someone who doesn't handle the case: 400",
                status == 400 and body["error"] == "InvalidSupportAssigneeError", status)
        status, case = t.call("PATCH", f"/support/cases/{case_id}/assignee", {"user_id": user_id(admin_email)}, org)
        t.check("organizer escalates to a platform admin",
                status == 200 and case["assigned_user_id"] == user_id(admin_email), status)
        t.check("the assignee is emailed", queued(admin_email, "support_case_assigned") == 1)
        t.check("assignment is audit-logged", t.db_value(
            "select count(*) from audit_logs where action = 'support_case.assigned' and entity_id = :i",
            i=case_id) == 1)
        t.call("POST", f"/support/cases/{case_id}/messages", {"body": "Any news?"}, attendee)
        t.check("replies now notify the assignee", queued(admin_email, "support_message") == 1)
        status, case = t.call("PATCH", f"/support/cases/{case_id}/assignee", {"user_id": None}, admin)
        t.check("unassigning works", status == 200 and case["assigned_user_id"] is None, status)

        # 7. lists
        _, mine = t.call("GET", "/support/cases/me", token=attendee)
        t.check("my cases: the attendee's three", sorted(c["id"] for c in mine)
                == sorted([case_id, from_order["id"], from_event["id"]]))
        _, mine = t.call("GET", "/support/cases/me", token=stranger)
        t.check("a stranger has no cases", mine == [])
        _, inbox = t.call("GET", "/support/cases/inbox", token=org)
        t.check("organizer inbox: cases about their events", {c["id"] for c in inbox}
                == {case_id, from_order["id"], from_event["id"]})
        _, inbox = t.call("GET", "/support/cases/inbox", token=other_org)
        t.check("another organizer's inbox doesn't show them", inbox == [])
        _, inbox = t.call("GET", "/support/cases/inbox?status=open", token=org)
        t.check("inbox filter by status", {c["status"] for c in inbox} == {"open"} and case_id in [c["id"] for c in inbox])
        status, _ = t.call("GET", "/support/cases/inbox", token=attendee)
        t.check("an attendee has no inbox: 403", status == 403, status)

        # 8. platform cases: organizer <-> platform admin
        status, platform = open_case(org, kind="platform", category="activation", subject="Fee paid twice",
                                     event_id=event_id)
        t.check("organizer opens a platform case about their event: 201", status == 201, status)
        status, _ = open_case(org, kind="platform", category="account")
        t.check("platform case without an event: 201", status == 201, status)
        status, _ = open_case(attendee, kind="platform", category="account")
        t.check("non-organizer can't open a platform case: 404", status == 404, status)
        status, _ = open_case(org, kind="platform", category="seating")
        t.check("attendee category on a platform case: 422", status == 422, status)
        status, _ = open_case(org, kind="platform", category="activation", event_id=other_event)
        t.check("platform case about someone else's event: 403", status == 403, status)
        status, _ = open_case(org, kind="platform", category="account", order_id=order["id"])
        t.check("platform cases take only an event: 422", status == 422, status)

        status, _ = t.call("GET", f"/support/cases/{platform['id']}", token=other_org)
        t.check("another organizer can't read it: 404", status == 404, status)
        _, inbox = t.call("GET", "/support/cases/inbox?kind=platform", token=admin)
        t.check("admin inbox has the platform case", platform["id"] in [c["id"] for c in inbox])
        before = queued(org_email, "support_message")
        status, _ = t.call("POST", f"/support/cases/{platform['id']}/messages", {"body": "Refunding the fee"}, admin)
        t.check("admin replies, organizer is emailed",
                status == 201 and queued(org_email, "support_message") == before + 1, status)
        status, _ = t.call("PATCH", f"/support/cases/{platform['id']}/status", {"status": "resolved"}, org)
        t.check("the organizer is the requester here, so can't resolve it: 403", status == 403, status)
        status, _ = t.call("PATCH", f"/support/cases/{platform['id']}/assignee", {"user_id": user_id(org_email)},
                           admin)
        t.check("platform cases can only be assigned to admins: 400", status == 400, status)
        status, case = t.call("PATCH", f"/support/cases/{platform['id']}/status", {"status": "resolved"}, admin)
        t.check("admin resolves it", status == 200 and case["status"] == "resolved", status)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
