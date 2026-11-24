"""Feature 7 stub: queue_email() saves emails in the caller's transaction; nothing is sent yet."""
import secrets
import sys
from sqlalchemy import text
from helpers import E2E, engine
from database import SessionLocal
from services.email_service import EMAIL_TEMPLATES, queue_email


def main() -> bool:
    with E2E("email outbox") as t:
        to = f"e2e-outbox-{secrets.token_hex(4)}@example.com"

        def delete_test_emails():
            with engine.begin() as c:
                c.execute(text("delete from email_outbox where to_email = :to"), {"to": to})
        t.on_cleanup(delete_test_emails)

        def outbox_rows():
            return t.db_rows("select * from email_outbox where to_email = :to order by id", to=to)

        # 1. committed with the action: saved as pending, not sent
        db = SessionLocal()
        try:
            email = queue_email(db, f"  {to} ", "order_confirmed",
                                {"order_id": 7, "event_title": "Абай кеші", "starts_at": "2026-12-01T19:00:00+05:00"})
            t.check("queue_email returns the row with an id before commit", email.id is not None)
            db.commit()
        finally:
            db.close()

        rows = outbox_rows()
        t.check("committed email is saved once", len(rows) == 1, f"{len(rows)} rows")
        row = rows[0]
        t.check("address is trimmed", row.to_email == to)
        t.check("saved as pending, nothing sent", row.status == "pending" and row.attempts == 0 and row.sent_at is None)
        t.check("data is stored as JSON, Kazakh text intact",
                row.data == {"order_id": 7, "event_title": "Абай кеші", "starts_at": "2026-12-01T19:00:00+05:00"})
        t.check("created_at is timezone-aware", row.created_at.tzinfo is not None)

        # 2. the action rolls back: its email disappears with it
        db = SessionLocal()
        try:
            queue_email(db, to, "payment_failed", {"order_id": 8})
            db.rollback()
        finally:
            db.close()
        t.check("rolled-back action leaves no email", len(outbox_rows()) == 1)

        # 3. no data is fine and stored as {}
        db = SessionLocal()
        try:
            queue_email(db, to, "event_cancelled")
            db.commit()
        finally:
            db.close()
        t.check("missing data is stored as {}", outbox_rows()[-1].data == {})

        # 4. programming errors fail at once and add nothing
        db = SessionLocal()
        try:
            try:
                queue_email(db, to, "order_confrimed", {"order_id": 9})
                t.check("unknown template is rejected", False)
            except ValueError as error:
                t.check("unknown template is rejected", "order_confrimed" in str(error))

            try:
                queue_email(db, to, "order_confirmed", {"starts_at": t.__class__})
                t.check("non-JSON data is rejected", False)
            except TypeError:
                t.check("non-JSON data is rejected", True)
            db.commit()
        finally:
            db.close()
        t.check("rejected calls add no rows", len(outbox_rows()) == 2)

        t.check("every SRS 4.10 notification has a template",
                {"verify_email", "password_reset", "order_confirmed", "payment_failed", "order_refunded",
                 "event_updated", "event_cancelled", "payout_status", "support_message"} <= EMAIL_TEMPLATES.keys())

        # 5. registering queues exactly one email, the verification link (test_account_emails.py has the rest)
        _, email_address = t.new_user()
        queued = t.db_rows("select template from email_outbox where to_email = :e", e=email_address)
        t.check("registration queues only the verification email", [r.template for r in queued] == ["verify_email"])
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
