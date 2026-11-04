from sqlalchemy.orm import Session
from repositories.ticket_repository import get_ticket_by_id
from exceptions import TicketNotFoundError
from qr import make_qr_png



def get_ticket_qr_service(user_id: int, ticket_id: int, db: Session) -> bytes:
    ticket = get_ticket_by_id(ticket_id, db)

    # only the person who registered may see the QR code; anyone holding it can enter the event
    if ticket.order.user_id != user_id:
        raise TicketNotFoundError()

    return make_qr_png(ticket.code)
