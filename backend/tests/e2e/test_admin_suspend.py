"""Feature 13: platform admins suspend users and events (SRS 4.12); organizer approval is audit-logged.

A suspended user can't sign in or use a token they already have. A suspended event disappears from
the public catalog and sells nothing, but tickets already issued still scan.
"""
import secrets
import sys
from helpers import E2E


def main() -> bool:
    with E2E("admin suspensions") as t:
        admin, admin_email = t.new_user(admin=True)
        org, _ = t.new_user(organizer=True)
        nobody, _ = t.new_user()

        def user_id(email):
            return t.db_value("select id from users where email = :e", e=email)

        def audited(action, entity_id):
            return t.db_value("select count(*) from audit_logs where action = :a and entity_id = :i "
                              "and actor_user_id = :admin", a=action, i=entity_id, admin=user_id(admin_email))

        # a user with a password we know, signed in
        email = f"e2e-{secrets.token_hex(4)}@example.com"
        t.emails.append(email)
        t.call("POST", "/auth/register", {"email": email, "password": "secret-pass"})
        _, session = t.call("POST", "/auth/login", {"email": email, "password": "secret-pass"})
        uid = user_id(email)

        # 1. suspending a user
        status, _ = t.call("POST", f"/admin/users/{uid}/suspend", {"reason": "Spam orders"}, nobody)
        t.check("non-admin can't suspend: 403", status == 403, status)
        status, _ = t.call("POST", f"/admin/users/{uid}/suspend", {"reason": "x"}, admin)
        t.check("reason is required: 422", status == 422, status)
        status, _ = t.call("POST", "/admin/users/999999999/suspend", {"reason": "Spam orders"}, admin)
        t.check("unknown user: 404", status == 404, status)
        status, body = t.call("POST", f"/admin/users/{uid}/suspend", {"reason": "Spam orders"}, admin)
        t.check("admin suspends the user", status == 200 and body["suspended_at"] is not None
                and body["suspension_reason"] == "Spam orders", status)
        t.check("audit: user.suspended by the admin", audited("user.suspended", uid) == 1)

        status, body = t.call("GET", "/orders/me", token=session["access_token"])
        t.check("their existing token stops working: 403 UserSuspendedError",
                status == 403 and body.get("error") == "UserSuspendedError", status)
        status, body = t.call("POST", "/auth/login", {"email": email, "password": "secret-pass"})
        t.check("they can't sign in: 403 UserSuspendedError",
                status == 403 and body.get("error") == "UserSuspendedError", status)
        status, _ = t.call("POST", "/auth/refresh", {"refresh_token": session["refresh_token"]})
        t.check("their sessions were signed out", status == 401, status)
        status, body = t.call("POST", "/auth/login", {"email": email, "password": "wrong-pass"})
        t.check("a wrong password still says 401, not that the account is suspended", status == 401, status)

        status, body = t.call("POST", f"/admin/users/{user_id(admin_email)}/suspend", {"reason": "Oops oops"}, admin)
        t.check("an admin can't suspend themselves: 400", status == 400
                and body["error"] == "CannotSuspendSelfError", status)

        status, body = t.call("POST", f"/admin/users/{uid}/unsuspend", token=admin)
        t.check("admin unsuspends", status == 200 and body["suspended_at"] is None
                and body["suspension_reason"] is None, status)
        t.check("audit: user.unsuspended", audited("user.unsuspended", uid) == 1)
        status, _ = t.call("POST", "/auth/login", {"email": email, "password": "secret-pass"})
        t.check("they can sign in again", status == 200, status)

        # 2. suspending an event
        event_id = t.make_event(org)
        ticket_type = t.make_ticket_type(org, event_id)
        _, early = t.order(nobody, event_id, [(ticket_type, 1)])

        status, body = t.call("POST", f"/admin/events/{event_id}/suspend", {"reason": "Fake event"}, admin)
        t.check("admin suspends the event", status == 200 and body["suspended_at"] is not None, status)
        t.check("audit: event.suspended", audited("event.suspended", event_id) == 1)
        status, _ = t.call("GET", f"/events/{event_id}")
        t.check("public event page: 404", status == 404, status)
        _, catalog = t.call("GET", "/events")
        t.check("gone from the catalog", event_id not in [e["id"] for e in catalog])
        status, _ = t.order(nobody, event_id, [(ticket_type, 1)])
        t.check("no new orders: 404", status == 404, status)
        _, mine = t.call("GET", "/events/me", token=org)
        own = [e for e in mine if e["id"] == event_id]
        t.check("the organizer still sees it, marked suspended",
                own and own[0]["suspended_at"] is not None and own[0]["suspension_reason"] == "Fake event")
        status, scan = t.call("POST", f"/events/{event_id}/check-in", {"code": early["tickets"][0]["code"]}, org)
        t.check("tickets issued before still scan", status == 200 and scan["result"] == "checked_in", scan)
        status, _ = t.call("POST", f"/admin/events/{event_id}/suspend", {"reason": "Fake event"}, nobody)
        t.check("non-admin can't suspend an event: 403", status == 403, status)

        status, body = t.call("POST", f"/admin/events/{event_id}/unsuspend", token=admin)
        t.check("admin unsuspends the event", status == 200 and body["suspended_at"] is None, status)
        t.check("audit: event.unsuspended", audited("event.unsuspended", event_id) == 1)
        status, _ = t.call("GET", f"/events/{event_id}")
        t.check("public again", status == 200, status)
        status, _ = t.order(nobody, event_id, [(ticket_type, 1)])
        t.check("sells again", status == 201, status)

        # 3. organizer approval is audit-logged with the admin's id
        applicant_token, applicant_email = t.new_user()
        t.call("POST", "/organizers/apply", token=applicant_token)
        status, profile = t.call("PATCH", f"/organizers/{user_id(applicant_email)}/approve", token=admin)
        t.check("admin approves an organizer", status == 200 and profile["status"] == "approved", status)
        t.check("audit: organizer.approved by the admin", audited("organizer.approved", profile["id"]) == 1)
        t.call("PATCH", f"/organizers/{user_id(applicant_email)}/approve", token=admin)
        t.check("approving twice logs once", audited("organizer.approved", profile["id"]) == 1)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
