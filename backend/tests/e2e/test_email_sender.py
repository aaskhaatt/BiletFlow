"""Feature 7: the outbox sender. Sends pending emails once, retries failures with backoff, gives up after MAX_ATTEMPTS.

Runs the sender in-process with a fake `send`, so no SMTP server is needed. If Mailpit is running
(SMTP_HOST set), the last check also sends one real email through it.
"""
import os
import re
import secrets
import sys
import threading
import time
from sqlalchemy import text
from helpers import E2E, engine
from database import SessionLocal
from services.email_service import EMAIL_TEMPLATES, MAX_ATTEMPTS, queue_email, send_due_emails, smtp_send
from services.email_templates import render_email


def main() -> bool:
    with E2E("email sender") as t:
        tag = secrets.token_hex(4)

        def address(n):
            return f"e2e-sender-{tag}-{n}@example.com"

        def delete_test_emails():
            with engine.begin() as c:
                c.execute(text("delete from email_outbox where to_email like :p"), {"p": f"e2e-sender-{tag}-%"})
        t.on_cleanup(delete_test_emails)

        def queue(n, template="event_cancelled", data=None):
            db = SessionLocal()
            try:
                email = queue_email(db, address(n), template, data or {"event_id": 1, "event_title": f"Jazz {n}"})
                db.commit()
                return email.id
            finally:
                db.close()

        def row(email_id):
            return t.db_rows("select * from email_outbox where id = :i", i=email_id)[0]

        def run_sender(send):
            db = SessionLocal()
            try:
                return send_due_emails(db, send=send)
            finally:
                db.close()

        def ours(outbox):
            return [m for m in outbox if m[0].startswith(f"e2e-sender-{tag}-")]

        # 1. pending emails are sent once, rendered, and marked sent
        first = [queue(i) for i in range(3)]
        sent = []
        run_sender(lambda to, subject, body: sent.append((to, subject, body)))
        t.check("all three emails were sent", len(ours(sent)) == 3, f"{len(ours(sent))} sent")
        t.check("oldest first", [m[0] for m in ours(sent)] == [address(i) for i in range(3)])
        t.check("subject and body are filled in", "Jazz 0" in ours(sent)[0][1] + ours(sent)[0][2])
        r = row(first[0])
        t.check("row is marked sent with sent_at and 1 attempt",
                r.status == "sent" and r.sent_at is not None and r.attempts == 1 and r.last_error is None)

        again = []
        run_sender(lambda to, subject, body: again.append(to))
        t.check("a second run sends nothing again", ours([(a,) for a in again]) == [])

        # 2. a failure is retried later, not at once
        failing = queue(10)

        def broken(to, subject, body):
            raise ConnectionRefusedError("smtp down")
        run_sender(broken)
        r = row(failing)
        t.check("failed send stays pending with the error", r.status == "pending" and r.attempts == 1
                and "smtp down" in (r.last_error or ""))
        t.check("retry is scheduled in the future",
                t.db_value("select next_attempt_at > now() from email_outbox where id = :i", i=failing))
        retried = []
        run_sender(lambda to, subject, body: retried.append(to))
        t.check("not retried before its time", address(10) not in retried)

        # 3. after MAX_ATTEMPTS failures it gives up
        for _ in range(MAX_ATTEMPTS - 1):
            with engine.begin() as c:
                c.execute(text("update email_outbox set next_attempt_at = now() where id = :i"), {"i": failing})
            run_sender(broken)
        r = row(failing)
        t.check(f"marked failed after {MAX_ATTEMPTS} attempts", r.status == "failed" and r.attempts == MAX_ATTEMPTS,
                f"{r.status}, {r.attempts} attempts")

        # 4. a bad template payload fails that email only, the rest still go out
        bad = queue(20, "order_refunded", {"order_id": 1})  # missing keys
        good = queue(21)
        sent = []
        run_sender(lambda to, subject, body: sent.append((to,)))
        t.check("one broken email doesn't block the others", address(21) in [m[0] for m in sent]
                and row(good).status == "sent" and row(bad).status == "pending" and row(bad).last_error)

        # 5. two senders at once never send the same email twice
        many = [queue(100 + i) for i in range(20)]
        seen, lock = [], threading.Lock()

        def record(to, subject, body):
            time.sleep(0.05)  # a slow SMTP server: widens the window for double sends
            with lock:
                seen.append(to)
        threads = [threading.Thread(target=run_sender, args=(record,)) for _ in range(4)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()
        mine = [a for a in seen if a.startswith(f"e2e-sender-{tag}-1")]
        t.check("4 parallel senders: 20 emails, each sent exactly once",
                len(mine) == 20 and len(set(mine)) == 20, f"{len(mine)} sends, {len(set(mine))} distinct")
        t.check("all 20 rows are sent", all(row(i).status == "sent" for i in many))

        # 6. every template renders with the keys EMAIL_TEMPLATES documents
        broken_templates = []
        for name, keys in EMAIL_TEMPLATES.items():
            data = {k: "x" for k in re.findall(r"\w+", keys.split("(")[0])}
            try:
                subject, body = render_email(name, data)
                if not subject.strip() or not body.strip():
                    broken_templates.append(name)
            except Exception as error:
                broken_templates.append(f"{name}: {error!r}")
        t.check("every template renders", not broken_templates, "; ".join(broken_templates))
        subject, body = render_email("verify_email", {"token": "abc123", "expires_at": "soon"})
        t.check("verify email contains a link with the token", "token=abc123" in body)

        # 7. optional: a real email through Mailpit
        if os.getenv("SMTP_HOST"):
            try:
                smtp_send(address(999), "BiletFlow e2e", "Mailpit check")
                t.check("real SMTP send through SMTP_HOST works", True)
            except OSError as error:
                t.check("real SMTP send through SMTP_HOST works", False, repr(error))
        else:
            print("SKIP  real SMTP send (SMTP_HOST not set)")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
