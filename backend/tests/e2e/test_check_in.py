"""Feature 3: event staff, scanning, undo, search, stats and concurrent double scans."""
import sys
import threading
from helpers import E2E


def main() -> bool:
    with E2E("check-in") as t:
        (org, _), (staff, staff_email), (alice, _), (stranger, _) = t.new_user(True), t.new_user(), t.new_user(), t.new_user()
        eid = t.make_event(org)
        tt = t.make_ticket_type(org, eid, quantity=50)
        other_eid = t.make_event(org)
        other_tt = t.make_ticket_type(org, other_eid)
        _, order = t.order(alice, eid, [(tt, 2)])
        t1, t2 = order["tickets"]
        other_ticket = t.order(alice, other_eid, [(other_tt, 1)], buyer_name="Daniyar")[1]["tickets"][0]

        def scan(token, code, event_id=eid):
            return t.call("POST", f"/events/{event_id}/check-in", {"code": code}, token)

        # staff management
        s, _ = scan(stranger, t1["code"])
        t.check("a stranger can't scan", s == 403, f"status {s}")
        s, b = t.call("POST", f"/events/{eid}/staff", {"email": staff_email}, org)
        t.check("organizer assigns staff by email", s == 201 and b["email"] == staff_email, f"status {s}")
        s, b = t.call("POST", f"/events/{eid}/staff", {"email": staff_email}, org)
        t.check("assigning twice is rejected", s == 409, b and b.get("error"))
        s, b = t.call("POST", f"/events/{eid}/staff", {"email": "nobody-here@example.com"}, org)
        t.check("unknown email", s == 404, b and b.get("error"))
        s, _ = t.call("POST", f"/events/{eid}/staff", {"email": staff_email}, alice)
        t.check("non-organizer can't assign staff", s in (403, 404), f"status {s}")
        s, staff_list = t.call("GET", f"/events/{eid}/staff", token=org)
        t.check("staff list", s == 200 and len(staff_list) == 1)
        s, events = t.call("GET", "/staff/events", token=staff)
        t.check("staff sees only the assigned event", s == 200 and [e["id"] for e in events] == [eid])

        # scanning
        s, r = scan(staff, t1["code"])
        t.check("scan a valid ticket", s == 200 and r["result"] == "checked_in",
                f"{r['result']}: {r['ticket']['attendee_name']}, {r['ticket']['ticket_type_name']}")
        s, r = scan(staff, t1["code"])
        t.check("scan the same ticket again", r["result"] == "already_checked_in" and r["ticket"]["checked_in_at"], r["result"])
        s, r = scan(staff, "T-doesnotexist000000000")
        t.check("unknown code", r["result"] == "invalid", r["message"])
        s, r = scan(staff, "C-campaign-promo-code")
        t.check("campaign-style QR is never admission", r["result"] == "invalid", r["message"])
        s, r = scan(staff, other_ticket["code"])
        t.check("ticket for another event", r["result"] == "wrong_event" and r["ticket"] is None, r["result"])
        s, r = scan(org, t1["code"])
        t.check("the organizer can scan too", s == 200 and r["result"] == "already_checked_in", f"status {s}")

        # search, stats, undo
        s, found = t.call("GET", f"/events/{eid}/check-in/search?q=aiger", token=staff)
        t.check("search by part of the name", s == 200 and len(found) == 2)
        s, _ = t.call("GET", f"/events/{eid}/check-in/search?q=a", token=staff)
        t.check("search needs at least 2 characters", s == 422, f"status {s}")
        s, stats = t.call("GET", f"/events/{eid}/check-in/stats", token=staff)
        t.check("stats: 2 registered, 1 checked in",
                stats == {"registered": 2, "checked_in": 1, "not_checked_in": 1, "cancelled": 0, "refunded": 0}, str(stats))
        s, b = t.call("POST", f"/events/{eid}/check-in/undo", {"ticket_id": t1["id"]}, staff)
        t.check("undo a check-in", s == 200 and b["status"] == "valid" and b["checked_in_at"] is None, f"status {s}")
        s, b = t.call("POST", f"/events/{eid}/check-in/undo", {"ticket_id": t1["id"]}, staff)
        t.check("undo twice is rejected", s == 409, b and b.get("error"))
        s, r = scan(staff, t1["code"])
        t.check("after undo it can be scanned again", r["result"] == "checked_in", r["result"])

        # concurrency: 10 scanners, same ticket, same moment
        barrier = threading.Barrier(10)
        outcomes = []

        def scanner():
            barrier.wait()
            outcomes.append(scan(staff, t2["code"])[1]["result"])

        threads = [threading.Thread(target=scanner) for _ in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        t.check("10 simultaneous scans: exactly one admits",
                outcomes.count("checked_in") == 1 and outcomes.count("already_checked_in") == 9,
                f"checked_in x{outcomes.count('checked_in')}, already x{outcomes.count('already_checked_in')}")

        records = dict(t.db_rows("select action, count(*) from check_in_records where event_id = :e group by action", e=eid))
        logs = dict(t.db_rows("select action, count(*) from audit_logs where event_id = :e and action like 'ticket.%' group by action", e=eid))
        t.check("check-in history: 3 check-ins, 1 undo", records == {"check_in": 3, "undo": 1}, str(records))
        t.check("audit log matches", logs == {"ticket.checked_in": 3, "ticket.check_in_undone": 1}, str(logs))

        # removing staff
        staff_id = staff_list[0]["user_id"]
        s, _ = t.call("DELETE", f"/events/{eid}/staff/{staff_id}", token=org)
        t.check("organizer removes staff", s == 204, f"status {s}")
        s, _ = scan(staff, t2["code"])
        t.check("removed staff can't scan anymore", s == 403, f"status {s}")
        s, _ = t.call("DELETE", f"/events/{eid}/staff/{staff_id}", token=org)
        t.check("removing again", s == 404, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
