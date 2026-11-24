"""Platform admin tools (SRS 4.12). Every action here is audit-logged in the same transaction."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from exceptions import CannotSuspendSelfError
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
