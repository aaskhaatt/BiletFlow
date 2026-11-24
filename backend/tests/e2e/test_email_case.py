"""Emails are case-insensitive: Ann@x.com and ann@x.com are the same account."""
import secrets
import sys
import threading
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from helpers import E2E, engine

PASSWORD = "correct-horse-1"


def main() -> bool:
    with E2E("email case") as t:
        tag = secrets.token_hex(4)
        mixed = f"Ann-{tag}@Example.COM"
        lower = mixed.lower()
        t.emails.append(lower)

        s, body = t.call("POST", "/auth/register", {"email": mixed, "password": PASSWORD})
        t.check("register with capitals", s == 201, f"status {s}")
        t.check("email is saved in lowercase", body and body["email"] == lower, str(body and body["email"]))

        s, body = t.call("POST", "/auth/register", {"email": lower, "password": PASSWORD})
        t.check("same email in lowercase is a duplicate", s == 409, f"status {s}")
        s, _ = t.call("POST", "/auth/register", {"email": f" ANN-{tag.upper()}@example.com ", "password": PASSWORD})
        t.check("same email in capitals and spaces is a duplicate", s == 409, f"status {s}")
        t.check("only one account exists",
                t.db_value("select count(*) from users where lower(email) = :e", e=lower) == 1)

        for variant in (mixed, lower, lower.upper()):
            s, _ = t.call("POST", "/auth/login", {"email": variant, "password": PASSWORD})
            t.check(f"log in as {variant[:12]}...", s == 200, f"status {s}")
        s, _ = t.call("POST", "/auth/login", {"email": lower, "password": "wrong-password"})
        t.check("wrong password still fails", s == 401, f"status {s}")

        # other places that look users up by email: staff assignment, order snapshots
        org, _ = t.new_user(organizer=True)
        event_id = t.make_event(org)
        s, staff = t.call("POST", f"/events/{event_id}/staff", {"email": lower.upper()}, org)
        t.check("assign staff by email in capitals", s == 201 and staff["email"] == lower, f"status {s}")

        _, tokens = t.call("POST", "/auth/login", {"email": mixed, "password": PASSWORD})
        ticket_type = t.make_ticket_type(org, event_id)
        s, order = t.order(tokens["access_token"], event_id, [(ticket_type, 1)])
        t.check("new orders store the lowercase email", s in (200, 201) and order["buyer_email"] == lower, f"status {s}")

        # the database itself refuses a second account that differs only in case
        try:
            with engine.begin() as c:
                c.execute(text("insert into users (email, password_hash, is_platform_admin) "
                               "values (:e, 'x', false)"), {"e": lower.upper()})
            t.emails.append(lower.upper())
            t.check("database rejects a case-only duplicate", False)
        except IntegrityError:
            t.check("database rejects a case-only duplicate", True)

        # an old row saved with capitals before the fix can still log in
        legacy = f"Legacy-{tag}@Example.com"
        t.emails.append(legacy)
        _, body = t.call("POST", "/auth/register", {"email": f"tmp-{tag}@example.com", "password": PASSWORD})
        t.emails.append(f"tmp-{tag}@example.com")
        with engine.begin() as c:
            c.execute(text("update users set email = :legacy where email = :tmp"),
                      {"legacy": legacy, "tmp": f"tmp-{tag}@example.com"})
        s, _ = t.call("POST", "/auth/login", {"email": legacy.lower(), "password": PASSWORD})
        t.check("old mixed-case row logs in with lowercase", s == 200, f"status {s}")

        # 10 people register the same address in different cases at the same moment
        race = f"race-{tag}@example.com"
        t.emails.append(race)
        variants = [race.upper() if i % 2 else race.title() for i in range(10)]
        statuses = []

        def register(email):
            # call_raw: a crash answers with plain text, not JSON, and must still count as a failure
            statuses.append(t.call_raw("POST", "/auth/register", {"email": email, "password": PASSWORD})[0])

        threads = [threading.Thread(target=register, args=(v,)) for v in variants]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        t.check("simultaneous sign-ups: exactly one account, the rest 409",
                sorted(statuses) == [201] + [409] * 9, str(sorted(statuses)))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
