from sqlalchemy.orm import Session
from sqlalchemy import select, update
from models import Ticket, TicketType, Order
from exceptions import TicketNotFoundError



def create_ticket(code: str, order_id: int, order_item_id: int, ticket_type_id: int, event_id: int, attendee_name: str, db: Session):
    ticket = Ticket(
        code = code,
        order_id = order_id,
        order_item_id = order_item_id,
        ticket_type_id = ticket_type_id,
        event_id = event_id,
        attendee_name = attendee_name,
        status = "valid"
    )

    db.add(ticket)
    db.flush()

    return ticket


def get_ticket_by_id(ticket_id: int, db: Session):
    ticket = db.get(Ticket, ticket_id)

    if ticket is None:
        raise TicketNotFoundError()

    return ticket


def get_attendees_by_event_id(event_id: int, db: Session):
    # one query joining tickets with their ticket type and order, for the organizer's attendee list
    stmt = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.attendee_name,
            Ticket.status,
            Ticket.created_at,
            TicketType.name.label("ticket_type_name"),
            Order.id.label("order_id"),
            Order.buyer_email,
        )
        .join(TicketType, Ticket.ticket_type_id == TicketType.id)
        .join(Order, Ticket.order_id == Order.id)
        .where(Ticket.event_id == event_id)
        .order_by(Ticket.created_at)
    )

    return db.execute(stmt).all()


def set_order_tickets_status(order_id: int, status: str, db: Session) -> int:
    # "valid" and "checked_in" tickets become cancelled/refunded; the scanner then rejects them
    stmt = (
        update(Ticket)
        .where(Ticket.order_id == order_id, Ticket.status.in_(["valid", "checked_in"]))
        .values(status=status)
    )

    return db.execute(stmt).rowcount
