from datetime import datetime
from models import AuditLog, User
from sqlalchemy import select, func
from sqlalchemy.orm import Session


def create_audit_log(actor_user_id: int | None, event_id: int | None, 
                     action: str, entity_type: str, entity_id: int | None, description: str, db: Session):
    new_audit = AuditLog(
        actor_user_id = actor_user_id,
        event_id = event_id,
        action = action,
        entity_type = entity_type,
        entity_id = entity_id,
        description = description
    )

    db.add(new_audit)
    db.flush()


def get_event_history(event_id: int, action_type: str | None, action: str | None, date_from: datetime | None,
                      date_to: datetime | None, limit: int, offset: int, db: Session) -> tuple[list, int]:
    """The event's audit rows, newest first, with the email of whoever did each one. Returns (page, total)."""
    stmt = (select(AuditLog, User.email.label("actor_email"))
            # LEFT JOIN: automatic actions (expired checkouts) and deleted accounts have no user
            .outerjoin(User, User.id == AuditLog.actor_user_id)
            .where(AuditLog.event_id == event_id))
    if action_type is not None:
        # "order" matches order.created, order.paid, ...; autoescape keeps the "_" in "ticket_type" a plain character
        stmt = stmt.where(AuditLog.action.startswith(action_type + ".", autoescape=True))
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at < date_to)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    # id breaks ties: everything saved in one transaction has the same created_at
    rows = db.execute(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)).all()

    return rows, total


def search_audit_log(filters: dict, date_from: datetime | None, date_to: datetime | None, limit: int | None,
                     offset: int, db: Session) -> tuple[list, int]:
    """The whole audit log for platform admins, newest first. filters: column name -> value (None = any)."""
    stmt = select(AuditLog, User.email.label("actor_email")).outerjoin(User, User.id == AuditLog.actor_user_id)
    for name, value in filters.items():
        if value is None:
            continue
        if name == "type":
            stmt = stmt.where(AuditLog.action.startswith(value + ".", autoescape=True))
        else:
            stmt = stmt.where(getattr(AuditLog, name) == value)
    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at < date_to)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return db.execute(stmt).all(), total


def get_entity_history(entity_type: str, entity_id: int, actions: list[str], db: Session) -> list:
    """Audit rows of one entity (e.g. a support case), oldest first."""
    stmt = (select(AuditLog).where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id,
                                   AuditLog.action.in_(actions))
            .order_by(AuditLog.created_at, AuditLog.id))
    return list(db.scalars(stmt))
