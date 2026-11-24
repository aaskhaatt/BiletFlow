from sqlalchemy.orm import Session
from repositories.ticket_repository import get_ticket_by_id
from repositories.order_repository import get_order_by_id
from repositories.event_repository import get_event_by_id
from exceptions import TicketNotFoundError, OrderNotFoundError, TicketNotPrintableError
from models import Order
from qr import make_qr_png
from ticket_pdf import PrintableTicket, render_tickets_pdf

# a checked-in ticket can still be printed (e.g. a souvenir, or someone who left and comes back);
# cancelled and refunded ones can't, so an invalid ticket never looks valid on paper
PRINTABLE_STATUSES = ("valid", "checked_in")



def get_ticket_qr_service(user_id: int, ticket_id: int, db: Session) -> bytes:
    ticket = get_ticket_by_id(ticket_id, db)

    # only the person who registered may see the QR code; anyone holding it can enter the event
    if ticket.order.user_id != user_id:
        raise TicketNotFoundError()

    return make_qr_png(ticket.code)


def _printable_tickets(order: Order, db: Session) -> list[PrintableTicket]:
    # the order's valid tickets as PDF pages, numbered "1 of N" in the order they were issued
    event = get_event_by_id(order.event_id, db)
    prices = {item.id: item.unit_price for item in order.items}
    tickets = sorted((t for t in order.tickets if t.status in PRINTABLE_STATUSES), key=lambda t: t.id)

    return [
        PrintableTicket(
            code=ticket.code,
            attendee_name=ticket.attendee_name,
            ticket_type_name=ticket.ticket_type.name,
            # the price paid (snapshot), not today's price of the ticket type
            price=prices[ticket.order_item_id],
            order_id=order.id,
            number=number,
            count=len(tickets),
            event_title=event.title,
            start_time=event.start_time,
            end_time=event.end_time,
            venue_name=event.venue_name,
            venue_address=event.venue_address,
            refund_policy=event.refund_policy,
            organizer_name=event.organizer.legal_name,
        )
        for number, ticket in enumerate(tickets, start=1)
    ]


def get_ticket_pdf_service(user_id: int, ticket_id: int, db: Session) -> bytes:
    ticket = get_ticket_by_id(ticket_id, db)

    # same rule as the QR code: only the buyer, and 404 so others can't tell the ticket exists
    if ticket.order.user_id != user_id:
        raise TicketNotFoundError()

    if ticket.status not in PRINTABLE_STATUSES:
        raise TicketNotPrintableError()

    page = [p for p in _printable_tickets(ticket.order, db) if p.code == ticket.code]

    return render_tickets_pdf(page)


def get_order_pdf_service(user_id: int, order_id: int, db: Session) -> bytes:
    order = get_order_by_id(order_id, db)

    if order.user_id != user_id:
        raise OrderNotFoundError()

    pages = _printable_tickets(order, db)

    # a pending checkout has no tickets yet; a cancelled or refunded order has only invalid ones
    if not pages:
        raise TicketNotPrintableError()

    return render_tickets_pdf(pages)
