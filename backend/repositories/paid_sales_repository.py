from sqlalchemy.orm import Session
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from models import PaidSalesActivation, Event



def get_activation_by_event_id(event_id: int, db: Session) -> PaidSalesActivation | None:
    stmt = select(PaidSalesActivation).where(PaidSalesActivation.event_id == event_id)

    return db.scalars(stmt).first()


def ensure_activation(event_id: int, db: Session) -> PaidSalesActivation:
    # create the row if it doesn't exist yet, safely even if two requests do this at the same moment:
    # INSERT ... ON CONFLICT (event_id) DO NOTHING never fails on the unique constraint
    stmt = insert(PaidSalesActivation).values(event_id=event_id).on_conflict_do_nothing(index_elements=[PaidSalesActivation.event_id])
    db.execute(stmt)

    return get_activation_by_event_id(event_id, db)


def lock_activation(event_id: int, db: Session) -> PaidSalesActivation:
    # SELECT ... FOR UPDATE: other transactions that want this row WAIT until we commit or roll back.
    # Needed when the steps between "check" and "write" can't be one UPDATE (here: charging a payment).
    # populate_existing: after waiting for the lock, overwrite any copy the session already cached,
    # otherwise we'd read stale values (fee not paid yet) and charge twice
    stmt = (
        select(PaidSalesActivation)
        .where(PaidSalesActivation.event_id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    return db.scalars(stmt).first()


def is_paid_sales_active(event_id: int, db: Session) -> bool:
    stmt = select(PaidSalesActivation.id).where(PaidSalesActivation.event_id == event_id, PaidSalesActivation.status == "active")

    return db.scalars(stmt).first() is not None


def change_activation_status(event_id: int, from_status: str, values: dict, db: Session):
    # atomic state transition: only moves if the row is still in `from_status`; None = it wasn't
    stmt = (
        update(PaidSalesActivation)
        .where(PaidSalesActivation.event_id == event_id, PaidSalesActivation.status == from_status)
        .values(**values)
        .returning(PaidSalesActivation.id)
    )

    return db.execute(stmt).scalar()


def list_activations(status: str | None, db: Session):
    stmt = (
        select(
            PaidSalesActivation.event_id, Event.title.label("event_title"), PaidSalesActivation.status,
            PaidSalesActivation.fee_amount, PaidSalesActivation.fee_paid_at, PaidSalesActivation.activated_at,
            PaidSalesActivation.suspended_at, PaidSalesActivation.suspension_reason,
        )
        .join(Event, PaidSalesActivation.event_id == Event.id)
        .order_by(PaidSalesActivation.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(PaidSalesActivation.status == status)

    return db.execute(stmt).all()
