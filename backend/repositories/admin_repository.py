from exceptions import EventReportNotFoundError
from models import EventReport
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def search_rows(model, db: Session, filters=(), q: str | None = None, q_columns=(), limit: int | None = 50,
                offset: int = 0):
    """Newest first. `q` matches any of `q_columns` (case-insensitive, % and _ are literal) or, if it's a
    number, the id. Returns (rows, total matching rows). limit=None returns every row (CSV export)."""
    stmt = select(model).where(*filters)
    if q:
        conditions = [column.icontains(q, autoescape=True) for column in q_columns]
        if q.isdigit():
            conditions.append(model.id == int(q))
        stmt = stmt.where(or_(*conditions))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(model.id.desc()).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt)), total


def create_event_report(event_id: int, reporter_user_id: int, reason: str, details: str | None, db: Session):
    report = EventReport(event_id=event_id, reporter_user_id=reporter_user_id, reason=reason, details=details)
    db.add(report)
    db.flush()
    return report


def get_event_report_by_id(report_id: int, db: Session) -> EventReport:
    report = db.get(EventReport, report_id)
    if report is None:
        raise EventReportNotFoundError()
    return report
