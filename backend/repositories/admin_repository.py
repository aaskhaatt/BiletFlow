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
