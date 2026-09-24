from sqlalchemy.orm import Session
from schemas.ticket_type import TicketTypeCreate, TicketTypeUpdate
from repositories.ticket_type_repository import create_ticket_type, get_ticket_types_by_event_id, update_ticket_type, get_ticket_type_by_id, update_ticket_type_visibility
from services.organizer_service import ensure_organizer_approved_service
from repositories.event_repository import get_event_by_id
from exceptions import InvalidTicketSalesTimeError, EventAccessDeniedError, EventNotFoundError
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



def get_ticket_types_by_event_id_service(event_id: int, db: Session):
    event = get_event_by_id(event_id, db)

    if event.status != "published":
        raise EventNotFoundError()

    return get_ticket_types_by_event_id(event_id, db)


def update_ticket_type_service(user_id: int, ticket_type_id: int, ticket_type_data: TicketTypeUpdate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)


    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()


    name = ticket_type_data.name if ticket_type_data.name is not None else ticket_type.name
    description = ticket_type_data.description if ticket_type_data.description is not None else ticket_type.description
    price = ticket_type_data.price if ticket_type_data.price is not None else ticket_type.price
    quantity = ticket_type_data.quantity if ticket_type_data.quantity is not None else ticket_type.quantity
    sales_start = ticket_type_data.sales_start if ticket_type_data.sales_start is not None else ticket_type.sales_start
    sales_end = ticket_type_data.sales_end if ticket_type_data.sales_end is not None else ticket_type.sales_end

    if sales_start >= sales_end:
        raise InvalidTicketSalesTimeError()

    return update_ticket_type(ticket_type, name, description, price, quantity, sales_start, sales_end, db)


def hide_ticket_type_service(user_id: int, ticket_type_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    return update_ticket_type_visibility(ticket_type, True, db)


def unhide_ticket_type_service(user_id: int, ticket_type_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    return update_ticket_type_visibility(ticket_type, False, db)