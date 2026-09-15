from models.ticket_type import TicketType
from exceptions import TicketTypeNotFoundError
from datetime import datetime
from sqlalchemy.orm import Session
from decimal import Decimal


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

