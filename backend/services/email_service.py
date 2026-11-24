import json
from sqlalchemy.orm import Session
from models import EmailOutbox
from repositories.email_outbox_repository import create_outbox_email


# Every email the platform sends (SRS 4.1, 4.10, 4.13), with the `data` keys each template will use.
# The sender and the email texts arrive with Feature 7; agree on new names before adding them.
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
