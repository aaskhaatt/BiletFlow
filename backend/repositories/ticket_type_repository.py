from models.ticket_type import TicketType
from exceptions import TicketTypeNotFoundError
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, update



def get_ticket_type_by_id(ticket_type_id: int, db: Session):
    ticket_type = db.get(TicketType, ticket_type_id)

    if ticket_type is None:
        raise TicketTypeNotFoundError()
    
    return ticket_type


def create_ticket_type(event_id: int, name: str, description: str | None, price: int, quantity: int, sales_start: datetime, sales_end: datetime, max_per_order: int, db: Session):
    ticket_type = TicketType(
        event_id = event_id,
        name=name,
        description = description,
        price = price,
        quantity = quantity,
        sales_start = sales_start,
        sales_end = sales_end,
        max_per_order = max_per_order
    )

    db.add(ticket_type)
    db.flush()

    return ticket_type


def get_ticket_types_by_event_id(event_id: int, db: Session) -> list[TicketType]:
    stmt = select(TicketType).where(TicketType.event_id == event_id, TicketType.is_hidden.is_(False))

    ticket_types = db.scalars(stmt).all()

    return ticket_types


def update_ticket_type(ticket_type: TicketType, name: str, description: str | None, price: int, quantity: int, sales_start: datetime, sales_end: datetime, max_per_order: int, db: Session):
    
    ticket_type.name = name
    ticket_type.description = description
    ticket_type.price = price
    ticket_type.quantity = quantity
    ticket_type.sales_start = sales_start
    ticket_type.sales_end = sales_end
    ticket_type.max_per_order = max_per_order

    db.flush()

    return ticket_type


def update_ticket_type_visibility(ticket_type: TicketType, is_hidden: bool, db: Session):

    ticket_type.is_hidden = is_hidden

    db.flush()
    
    return ticket_type


def reserve_ticket_type_inventory(ticket_type_id: int, quantity: int, db: Session) -> int | None:
    # ONE statement checks AND reserves, so two buyers can never both take the last ticket.
    # Postgres locks the row; a second concurrent UPDATE waits, then re-checks the WHERE with the new value.
    stmt = (
        update(TicketType)
        .where(TicketType.id == ticket_type_id, TicketType.sold_count + quantity <= TicketType.quantity)
        .values(sold_count=TicketType.sold_count + quantity)
        .returning(TicketType.sold_count)
    )

    # None means no row matched: not enough tickets left
    return db.execute(stmt).scalar()


def event_has_paid_ticket_type(event_id: int, db: Session) -> bool:
    stmt = select(TicketType.id).where(TicketType.event_id == event_id, TicketType.price > 0).limit(1)

    return db.scalars(stmt).first() is not None


def release_ticket_type_inventory(ticket_type_id: int, quantity: int, db: Session):
    # gives held tickets back when a pending order expires; never goes below zero
    stmt = (
        update(TicketType)
        .where(TicketType.id == ticket_type_id, TicketType.sold_count >= quantity)
        .values(sold_count=TicketType.sold_count - quantity)
    )
    db.execute(stmt)
