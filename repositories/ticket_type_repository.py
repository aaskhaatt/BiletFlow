from models.ticket_type import TicketType
from exceptions import TicketTypeNotFoundError
from datetime import datetime
from sqlalchemy.orm import Session
from decimal import Decimal
from sqlalchemy import select



def get_ticket_type_by_id(ticket_type_id: int, db: Session):
    ticket_type = db.get(TicketType, ticket_type_id)

    if ticket_type is None:
        raise TicketTypeNotFoundError()
    
    return ticket_type


def create_ticket_type(event_id: int, name: str, description: str | None, price: Decimal, quantity: int, sales_start: datetime, sales_end: datetime, db: Session):
    ticket_type = TicketType(
        event_id = event_id,
        name=name,
        description = description,
        price = price,
        quantity = quantity,
        sales_start = sales_start,
        sales_end = sales_end
    )

    db.add(ticket_type)
    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def get_ticket_types_by_event_id(event_id: int, db: Session) -> list[TicketType]:
    stmt = select(TicketType).where(TicketType.event_id == event_id, TicketType.is_hidden.is_(False))

    ticket_types = db.scalars(stmt).all()

    return ticket_types


def update_ticket_type(ticket_type: TicketType, name: str, description: str | None, price: Decimal, quantity: int, sales_start: datetime, sales_end: datetime, db: Session):
    
    ticket_type.name = name
    ticket_type.description = description
    ticket_type.price = price
    ticket_type.quantity = quantity
    ticket_type.sales_start = sales_start
    ticket_type.sales_end = sales_end

    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def update_ticket_type_visibility(ticket_type: TicketType, is_hidden: bool, db: Session):

    ticket_type.is_hidden = is_hidden

    db.commit()
    db.refresh(ticket_type)
    
    return ticket_type
