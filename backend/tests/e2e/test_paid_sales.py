"""Feature 4: paid sales activation checklist, simulated fee payment, admin suspension and settings."""
import sys
import threading
from sqlalchemy import text
from helpers import E2E, engine


def main() -> bool:
    with E2E("paid sales") as t:
        (org, _), (alice, _), (admin, _), (stranger, _) = t.new_user(True), t.new_user(), t.new_user(admin=True), t.new_user()

        # the test changes the platform fee; put back whatever was there before, even if the test crashes
        original_fee = t.db_value("select value from platform_settings where key = 'activation_fee_kzt'")

        def restore_fee():
            with engine.begin() as c:
                if original_fee is None:
                    c.execute(text("delete from platform_settings where key = 'activation_fee_kzt'"))
                else:
                    c.execute(text("update platform_settings set value = :v where key = 'activation_fee_kzt'"), {"v": original_fee})
        t.on_cleanup(restore_fee)

        s, _ = t.call("PUT", "/admin/settings/activation-fee", {"amount_kzt": 5000}, admin)
        t.check("admin sets the activation fee", s == 200, f"status {s}")

        eid = t.make_event(org)
        t.make_ticket_type(org, eid, name="Free")
        s, st = t.call("GET", f"/events/{eid}/paid-sales", token=org)
        t.check("checklist starts empty", s == 200 and st["status"] == "not_started" and not any(st["checklist"].values()),
                str(st["checklist"]))
        t.check("fee shown, clearly marked simulated", st["fee_amount"] == 5000 and st["is_simulated"] is True)
        s, _ = t.call("GET", f"/events/{eid}/paid-sales", token=stranger)
        t.check("someone else can't see the checklist", s in (403, 404), f"status {s}")

        vip = t.make_ticket_type(org, eid, name="VIP", price=15000)
        s, st = t.call("GET", f"/events/{eid}/paid-sales", token=org)
        t.check("step 1: paid ticket type detected", st["checklist"]["has_paid_ticket_type"] is True)
        s, b = t.order(alice, eid, [(vip, 1)])
        t.check("paid tickets locked before activation", s == 409 and b["error"] == "PaidSalesNotActiveError", b.get("error"))
        s, b = t.call("POST", f"/events/{eid}/paid-sales/activate", token=org)
        t.check("activate with incomplete checklist", s == 409, b.get("error"))

        # step 2: simulated identity check
        s, _ = t.call("POST", "/organizers/me/verification", {"legal_name": "Aigerim Sadykova", "contact_phone": "12345"}, org)
        t.check("invalid phone is rejected", s == 422, f"status {s}")
        s, p = t.call("POST", "/organizers/me/verification", {"legal_name": "Aigerim Sadykova", "contact_phone": "+7 (701) 123-45-67"}, org)
        t.check("step 2: identity verified, phone normalized", s == 200 and p["identity_verified_at"] and p["contact_phone"] == "+77011234567",
                p.get("contact_phone"))

        # step 3: payout account
        s, _ = t.call("PUT", "/organizers/me/payout-account", {"holder_name": "Aigerim Sadykova", "bank_name": "Halyk Bank", "iban": "DE89 3704"}, org)
        t.check("invalid IBAN is rejected", s == 422, f"status {s}")
        s, p = t.call("PUT", "/organizers/me/payout-account",
                      {"holder_name": "Aigerim Sadykova", "bank_name": "Halyk Bank", "iban": "kz86 125k zt50 0410 0100"}, org)
        t.check("step 3: payout account connected", s == 200 and p["payout_account"]["iban_last4"] == "0100", str(p.get("payout_account")))
        stored = t.db_rows("select * from payout_accounts where iban_last4 = '0100'")
        t.check("the full IBAN is not stored anywhere", stored and not any("125KZT50" in str(v) for v in stored[-1]))

        # step 4: terms
        s, st = t.call("POST", f"/events/{eid}/paid-sales/accept-terms", token=org)
        t.check("step 4: terms accepted", s == 200 and st["checklist"]["terms_accepted"] and st["status"] == "pending")

        # step 5: the fee; a failed payment first
        s, b = t.call("POST", f"/events/{eid}/paid-sales/pay-fee", {"simulate_outcome": "failure"}, org)
        t.check("simulated card decline", s == 402, b.get("error"))
        failed = t.db_value("select count(*) from payments where event_id = :e and status = 'failed'", e=eid)
        t.check("the failed attempt is kept on record", failed == 1, f"{failed} failed payment(s)")
        s, pay = t.call("POST", f"/events/{eid}/paid-sales/pay-fee", {}, org)
        t.check("step 5: fee paid", s == 200 and pay["status"] == "succeeded" and pay["amount"] == 5000, f"{pay.get('provider_reference')}")
        t.check("payment is labelled simulated", pay["is_simulated"] is True and pay["provider"] == "simulated"
                and pay["provider_reference"].startswith("SIM-"))
        s, b = t.call("POST", f"/events/{eid}/paid-sales/pay-fee", {}, org)
        t.check("paying twice is refused", s == 409, b.get("error"))

        s, st = t.call("POST", f"/events/{eid}/paid-sales/activate", token=org)
        t.check("activate", s == 200 and st["status"] == "active" and st["activated_at"], st.get("status"))
        s, b = t.order(alice, eid, [(vip, 1)])
        t.check("paid tickets unlocked (checkout itself is Feature 5)", s == 409 and b["error"] == "PaidTicketsNotAvailableError", b.get("error"))

        # activation is per event
        other = t.make_event(org)
        s, st = t.call("GET", f"/events/{other}/paid-sales", token=org)
        t.check("another event of the same organizer is not active", st["status"] == "not_started")
        t.check("...but reuses the organizer-level steps", st["checklist"]["identity_verified"] and st["checklist"]["payout_account_connected"])

        # double-clicked "Pay": 5 simultaneous requests must charge exactly once.
        # Accept the terms first, as in the real app, so the activation row already EXISTS: that is the
        # dangerous case where only the row lock (with populate_existing) prevents a double charge.
        t.call("PUT", "/admin/settings/activation-fee", {"amount_kzt": 7000}, admin)
        t.call("POST", f"/events/{other}/paid-sales/accept-terms", token=org)
        barrier = threading.Barrier(5)
        statuses = []

        def pay():
            barrier.wait()
            statuses.append(t.call("POST", f"/events/{other}/paid-sales/pay-fee", {}, org)[0])

        threads = [threading.Thread(target=pay) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        charged = t.db_value("select count(*) from payments where event_id = :e and status = 'succeeded'", e=other)
        t.check("5 simultaneous payments: charged exactly once", statuses.count(200) == 1 and charged == 1,
                f"200 x{statuses.count(200)}, 409 x{statuses.count(409)}, succeeded payments: {charged}")
        s, st = t.call("GET", f"/events/{other}/paid-sales", token=org)
        t.check("new fee (7000) applied to the new event only", st["fee_amount"] == 7000)
        s, st = t.call("GET", f"/events/{eid}/paid-sales", token=org)
        t.check("first event keeps the fee it paid (5000)", st["fee_amount"] == 5000)

        # platform admin
        s, _ = t.call("PUT", "/admin/settings/activation-fee", {"amount_kzt": 1}, org)
        t.check("non-admin can't change settings", s == 403, f"status {s}")
        s, records = t.call("GET", "/admin/paid-sales?status=active", token=admin)
        t.check("admin sees the active activation", s == 200 and any(r["event_id"] == eid for r in records))
        s, _ = t.call("POST", f"/admin/events/{eid}/paid-sales/suspend", {"reason": "Suspected fraud"}, org)
        t.check("organizer can't use admin suspend", s == 403, f"status {s}")
        s, st = t.call("POST", f"/admin/events/{eid}/paid-sales/suspend", {"reason": "Suspected fraud"}, admin)
        t.check("admin suspends paid sales", s == 200 and st["status"] == "suspended" and st["suspension_reason"] == "Suspected fraud")
        s, b = t.order(alice, eid, [(vip, 1)])
        t.check("suspended: paid tickets locked again", s == 409 and b["error"] == "PaidSalesNotActiveError", b.get("error"))
        s, _ = t.call("POST", f"/admin/events/{eid}/paid-sales/suspend", {"reason": "again"}, admin)
        t.check("suspending twice", s == 409, f"status {s}")
        s, st = t.call("POST", f"/admin/events/{eid}/paid-sales/reinstate", token=admin)
        t.check("admin reinstates", s == 200 and st["status"] == "active" and st["suspension_reason"] is None)

        actions = [r.action for r in t.db_rows("select action from audit_logs where event_id = :e and action like 'paid_sales.%' order by id", e=eid)]
        expected = ["paid_sales.terms_accepted", "paid_sales.fee_payment_failed", "paid_sales.fee_paid",
                    "paid_sales.activated", "paid_sales.suspended", "paid_sales.reinstated"]
        t.check("every step is in the audit log", actions == expected, str(actions))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
