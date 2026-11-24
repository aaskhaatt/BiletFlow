"""Feature 13: attendees report an event; platform admins review the reports (SRS 4.12)."""
import sys
from concurrent.futures import ThreadPoolExecutor
from helpers import E2E


def main() -> bool:
    with E2E("event reports") as t:
        admin, admin_email = t.new_user(admin=True)
        org, _ = t.new_user(organizer=True)
        alice, _ = t.new_user()
        bob, _ = t.new_user()
        event_id = t.make_event(org)
        draft = t.make_event(org, publish=False)

        def report(token, event=event_id, **fields):
            return t.call("POST", f"/events/{event}/reports", {"reason": "fraud", "details": "Fake venue", **fields},
                          token)

        # 1. reporting
        status, body = report(alice)
        t.check("attendee reports an event: 201", status == 201 and body["status"] == "open"
                and body["reason"] == "fraud", status)
        report_id = body["id"]
        status, body = report(alice)
        t.check("the same user can't report it twice: 409", status == 409
                and body["error"] == "EventAlreadyReportedError", status)
        status, _ = t.call("POST", f"/events/{event_id}/reports", {"reason": "fraud"})
        t.check("signing in is required: 401", status == 401, status)
        status, _ = report(bob, reason="because")
        t.check("unknown reason: 422", status == 422, status)
        status, _ = report(bob, event=draft)
        t.check("a draft can't be reported: 404", status == 404, status)
        status, _ = report(bob, reason="misleading", details=None)
        t.check("details are optional", status == 201, status)

        with ThreadPoolExecutor(6) as pool:
            racing, _ = t.new_user()
            statuses = list(pool.map(lambda _: report(racing)[0], range(6)))
        t.check("6 parallel reports by one user: one 201, the rest 409",
                sorted(statuses) == [201, 409, 409, 409, 409, 409], sorted(statuses))

        # 2. reviewing
        status, _ = t.call("GET", "/admin/event-reports", token=alice)
        t.check("only admins see reports: 403", status == 403, status)
        _, page = t.call("GET", f"/admin/event-reports?event_id={event_id}&status=open", token=admin)
        t.check("admin lists the open reports of the event", page["total"] == 3
                and {r["event_id"] for r in page["items"]} == {event_id}, page)

        status, body = t.call("POST", f"/admin/event-reports/{report_id}/review",
                              {"status": "actioned", "note": "Event suspended"}, admin)
        t.check("admin marks it actioned", status == 200 and body["status"] == "actioned"
                and body["reviewed_at"] and body["review_note"] == "Event suspended", status)
        admin_id = t.db_value("select id from users where email = :e", e=admin_email)
        t.check("review is audit-logged with the admin", t.db_value(
            "select count(*) from audit_logs where action = 'event_report.reviewed' and entity_id = :i "
            "and actor_user_id = :a", i=report_id, a=admin_id) == 1)
        status, _ = t.call("POST", f"/admin/event-reports/{report_id}/review", {"status": "open"}, admin)
        t.check("a review must decide: 422 for 'open'", status == 422, status)
        status, _ = t.call("POST", "/admin/event-reports/999999999/review", {"status": "dismissed"}, admin)
        t.check("unknown report: 404", status == 404, status)
        _, page = t.call("GET", f"/admin/event-reports?event_id={event_id}&status=open", token=admin)
        t.check("reviewed reports leave the open list", page["total"] == 2)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
