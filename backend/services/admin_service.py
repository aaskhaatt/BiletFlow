"""Platform admin tools (SRS 4.12). Every action here is audit-logged in the same transaction."""
import csv
import io
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from exceptions import CannotSuspendSelfError, EventAlreadyReportedError
from models import Event, EventReport, Order, Payment, Refund, User
from repositories.admin_repository import create_event_report, get_event_report_by_id, search_rows
from services.event_service import get_public_event_service
from repositories.event_repository import get_event_by_id
from repositories.refresh_token_repository import delete_user_refresh_tokens
from repositories.user_repository import get_user_by_id
from services.audit_service import log_action


def _set_suspension(target, reason: str | None):
    target.suspended_at = datetime.now(timezone.utc) if reason else None
    target.suspension_reason = reason


def suspend_user_service(admin_user_id: int, user_id: int, reason: str, db: Session):
    if user_id == admin_user_id:
        raise CannotSuspendSelfError()
    user = get_user_by_id(user_id, db)
    _set_suspension(user, reason)
    # signed out everywhere; get_current_user also refuses their access tokens from now on
    delete_user_refresh_tokens(user.id, db)
    log_action(db, admin_user_id, "user.suspended", "user", user.id, f"Suspended {user.email}: {reason}")
    db.commit()
    db.refresh(user)
    return user


def unsuspend_user_service(admin_user_id: int, user_id: int, db: Session):
    user = get_user_by_id(user_id, db)
    if user.suspended_at is not None:
        _set_suspension(user, None)
        log_action(db, admin_user_id, "user.unsuspended", "user", user.id, f"Unsuspended {user.email}")
        db.commit()
        db.refresh(user)
    return user


def suspend_event_service(admin_user_id: int, event_id: int, reason: str, db: Session):
    event = get_event_by_id(event_id, db)
    _set_suspension(event, reason)
    log_action(db, admin_user_id, "event.suspended", "event", event.id, f"Suspended event: {reason}", event_id=event.id)
    db.commit()
    db.refresh(event)
    return event


def unsuspend_event_service(admin_user_id: int, event_id: int, db: Session):
    event = get_event_by_id(event_id, db)
    if event.suspended_at is not None:
        _set_suspension(event, None)
        log_action(db, admin_user_id, "event.unsuspended", "event", event.id, "Unsuspended event", event_id=event.id)
        db.commit()
        db.refresh(event)
    return event


# --- search and monitoring lists (SRS 4.12) ----------------------------------------------------

def _only(*conditions):
    # drops the filters the admin didn't set (None)
    return [condition for value, condition in conditions if value is not None]


def search_users_service(q, suspended, limit, offset, db: Session):
    filters = _only((suspended, User.suspended_at.is_not(None) if suspended else User.suspended_at.is_(None)))
    return search_rows(User, db, filters, q, [User.email], limit, offset)


def search_events_service(q, status, suspended, limit, offset, db: Session):
    filters = _only((status, Event.status == status),
                    (suspended, Event.suspended_at.is_not(None) if suspended else Event.suspended_at.is_(None)))
    return search_rows(Event, db, filters, q, [Event.title, Event.venue_name], limit, offset)


def search_orders_service(q, status, event_id, limit, offset, db: Session):
    filters = _only((status, Order.status == status), (event_id, Order.event_id == event_id))
    return search_rows(Order, db, filters, q, [Order.buyer_email, Order.buyer_name], limit, offset)


def search_payments_service(q, status, purpose, event_id, limit, offset, db: Session):
    filters = _only((status, Payment.status == status), (purpose, Payment.purpose == purpose),
                    (event_id, Payment.event_id == event_id))
    return search_rows(Payment, db, filters, q, [Payment.provider_reference], limit, offset)


def search_refunds_service(q, event_id, limit, offset, db: Session):
    filters = _only((event_id, Refund.event_id == event_id))
    return search_rows(Refund, db, filters, q, [Refund.provider_reference, Refund.reason], limit, offset)


def rows_to_csv(rows, schema) -> str:
    """The schema's fields as columns. Starts with a BOM so Excel opens Cyrillic text correctly."""
    out = io.StringIO()
    out.write("﻿")
    writer = csv.writer(out)
    columns = list(schema.model_fields)
    writer.writerow(columns)
    for row in rows:
        data = schema.model_validate(row).model_dump(mode="json")
        writer.writerow([data[c] for c in columns])
    return out.getvalue()


# --- event reports (SRS 4.12) ------------------------------------------------------------------

def report_event_service(user_id: int, event_id: int, data, db: Session):
    get_public_event_service(event_id, db)  # only events people can actually see
    try:
        report = create_event_report(event_id, user_id, data.reason, data.details, db)
        db.commit()
    except IntegrityError:
        # the unique (event, reporter) constraint caught a second report, even one sent at the same moment
        db.rollback()
        raise EventAlreadyReportedError()
    db.refresh(report)
    return report


def search_event_reports_service(status, event_id, limit, offset, db: Session):
    filters = _only((status, EventReport.status == status), (event_id, EventReport.event_id == event_id))
    return search_rows(EventReport, db, filters, None, [], limit, offset)


def review_event_report_service(admin_user_id: int, report_id: int, status: str, note: str | None, db: Session):
    report = get_event_report_by_id(report_id, db)
    old = report.status
    report.status = status
    report.review_note = note
    report.reviewed_by_user_id = admin_user_id
    report.reviewed_at = datetime.now(timezone.utc)
    log_action(db, admin_user_id, "event_report.reviewed", "event_report", report.id,
               f"Report ({report.reason}): {old} -> {status}" + (f": {note}" if note else ""), event_id=report.event_id)
    db.commit()
    db.refresh(report)
    return report
