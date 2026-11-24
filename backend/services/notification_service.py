"""The emails that orders, payments, cancellations and event changes send (SRS 4.10).

Each function only QUEUES an email (services/email_service.py): it's saved in the caller's transaction and sent
later by the background sender. Call these before the service's commit, like log_action, so an action that
rolls back never leaves an email behind. The `data` keys must match the placeholders in email_templates.py.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models import Event, Order
from repositories.notification_repository import get_ticket_holder_emails
from services.email_service import queue_email

# all of Kazakhstan uses UTC+5; emails show times the way attendees read the clock
KZ_TIME = timezone(timedelta(hours=5))


def _order_data(order: Order, event_title: str, **extra) -> dict:
    return {"order_id": order.id, "event_id": order.event_id, "event_title": event_title, **extra}


def notify_order_confirmed(db: Session, order: Order, event_title: str):
    # a free registration, or a payment that went through: the tickets exist now
    queue_email(db, order.buyer_email, "order_confirmed", _order_data(order, event_title))


def notify_payment_failed(db: Session, order: Order, event_title: str):
    queue_email(db, order.buyer_email, "payment_failed", _order_data(order, event_title, amount=order.total_amount))


def notify_order_cancelled(db: Session, order: Order, event_title: str, reason: str | None):
    queue_email(db, order.buyer_email, "order_cancelled",
                _order_data(order, event_title, reason=reason or "No reason given"))


def notify_order_refunded(db: Session, order: Order, event_title: str, reason: str | None):
    queue_email(db, order.buyer_email, "order_refunded",
                _order_data(order, event_title, amount=order.total_amount, reason=reason or "No reason given"))


def notify_event_cancelled(db: Session, event: Event, emails: set[str]):
    # one email per person, even if they had several orders
    for email in sorted(emails):
        queue_email(db, email, "event_cancelled", {"event_id": event.id, "event_title": event.title})


def format_moment(moment: datetime) -> str:
    return moment.astimezone(KZ_TIME).strftime("%a, %d %b %Y, %H:%M") + " (UTC+5)"


def notify_event_updated(db: Session, event: Event, changes: list[str]) -> int:
    """Tells everyone holding a valid ticket what changed. Returns how many emails were queued."""
    emails = get_ticket_holder_emails(event.id, db)
    for email in emails:
        queue_email(db, email, "event_updated",
                    {"event_id": event.id, "event_title": event.title, "changes": "\n".join(changes)})
    return len(emails)
