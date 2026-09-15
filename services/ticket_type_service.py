from sqlalchemy.orm import Session
from schemas.ticket_type import TicketTypeCreate
from repositories.ticket_type_repository import create_ticket_type
from services.organizer_service import ensure_organizer_approved_service
from repositories.event_repository import get_event_by_id
from exceptions import InvalidTicketSalesTimeError, EventAccessDeniedError
from models.ticket_type import TicketType


def create_ticket_type_service(user_id: int, event_id: int, ticket_type_data: TicketTypeCreate, db: Session) -> TicketType:
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()


    if ticket_type_data.sales_start >= ticket_type_data.sales_end:
        raise InvalidTicketSalesTimeError()



    return create_ticket_type(
        event_id,
        ticket_type_data.name, 
        ticket_type_data.description,
        ticket_type_data.price,
        ticket_type_data.quantity,
        ticket_type_data.sales_start, 
        ticket_type_data.sales_end,
        db
    )