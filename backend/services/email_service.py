import json
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from sqlalchemy.orm import Session
from models import EmailOutbox
from repositories.email_outbox_repository import claim_due_email, create_outbox_email
from services.email_templates import render_email


# Every email the platform sends (SRS 4.1, 4.10, 4.13), with the `data` keys each template will use.
# Texts are in services/email_templates.py; agree on new names before adding them.
EMAIL_TEMPLATES = {
    # accounts (Dev B)
    "verify_email": "token, expires_at",
    "password_reset": "token, expires_at",
    # orders and events (Dev A)
    "order_confirmed": "order_id, event_id, event_title (tickets are attached by the sender)",
    "payment_failed": "order_id, event_id, event_title, amount",
    "order_cancelled": "order_id, event_id, event_title, reason",
    "order_refunded": "order_id, event_id, event_title, amount, reason",
    "event_updated": "event_id, event_title, changes",
    "event_cancelled": "event_id, event_title",
    "payout_status": "event_id, event_title, status",
    # support cases (Dev B)
    "support_message": "case_id, subject",
    "support_case_assigned": "case_id, subject",
    "support_case_status_changed": "case_id, subject, status",
}


def queue_email(db: Session, to: str, template: str, data: dict | None = None) -> EmailOutbox:
    """Saves an email to send later. Call it BEFORE the service's commit, like log_action.

    The email is saved in the caller's transaction: if the action rolls back, the email is gone too,
    so nobody gets an "order confirmed" email for an order that failed. Nothing is sent yet.

    `data` must be JSON-safe (str, int, float, bool, None, lists, dicts). Pass datetimes as
    `.isoformat()` strings. Unknown templates and non-JSON data raise at once, because they are
    programming errors, not user input.
    """
    if template not in EMAIL_TEMPLATES:
        raise ValueError(f"unknown email template {template!r}; add it to EMAIL_TEMPLATES first")

    data = data or {}
    try:
        json.dumps(data)
    except TypeError as error:
        raise TypeError(f"email data for {template!r} is not JSON-safe: {error}") from None

    return create_outbox_email(to.strip(), template, data, db)


# --- sending (the background loop in background.py calls send_due_emails) ---------------------

MAX_ATTEMPTS = 5
# while one sender talks to the SMTP server, nobody else may take the row
SEND_LEASE = timedelta(minutes=5)
# a failed attempt n waits RETRY_BASE * 2**(n-1): 1, 2, 4, 8 minutes
RETRY_BASE = timedelta(minutes=1)


def smtp_send(to: str, subject: str, body: str) -> None:
    # shortcut: no SMTP login or TLS (Mailpit needs none); add SMTP_USER/SMTP_PASSWORD + starttls for a real provider
    message = EmailMessage()
    message["From"] = os.getenv("MAIL_FROM", "BiletFlow <no-reply@biletflow.local>")
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "1025")), timeout=30) as smtp:
        smtp.send_message(message)


def send_due_emails(db: Session, send=smtp_send) -> int:
    """Sends every pending email whose time has come, one at a time. Returns how many were sent.

    Each email is claimed and committed BEFORE sending, so a slow SMTP server never holds a database
    lock and parallel senders never take the same row. If the process dies between sending and
    marking the row sent, the row is retried after the lease: at-least-once, which SMTP can't beat.
    """
    sent = 0
    while True:
        now = datetime.now(timezone.utc)
        email = claim_due_email(now + SEND_LEASE, db)
        db.commit()
        if email is None:
            return sent

        try:
            subject, body = render_email(email.template, email.data)
            send(email.to_email, subject, body)
        except Exception as error:
            email.last_error = repr(error)[:1000]
            if email.attempts >= MAX_ATTEMPTS:
                email.status = "failed"
            else:
                email.next_attempt_at = datetime.now(timezone.utc) + RETRY_BASE * 2 ** (email.attempts - 1)
        else:
            email.status = "sent"
            email.sent_at = datetime.now(timezone.utc)
            email.last_error = None
            sent += 1
        db.commit()
