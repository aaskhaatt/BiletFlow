from sqlalchemy.orm import Session
from services.event_service import ensure_event_owner_service
from schemas.ticket_type import TicketTypeCreate, TicketTypeUpdate
from repositories.ticket_type_repository import (create_ticket_type, get_ticket_types_by_event_id, update_ticket_type, get_ticket_type_by_id,
                                                 update_ticket_type_visibility, get_all_ticket_types_by_event_id)
from services.organizer_service import ensure_organizer_approved_service
from services.audit_service import log_action
from repositories.event_repository import get_event_by_id
from exceptions import InvalidTicketSalesTimeError, EventAccessDeniedError, EventNotFoundError, QuantityBelowSoldError
from models.ticket_type import TicketType


def create_ticket_type_service(user_id: int, event_id: int, ticket_type_data: TicketTypeCreate, db: Session) -> TicketType:
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()


    if ticket_type_data.sales_start >= ticket_type_data.sales_end:
        raise InvalidTicketSalesTimeError()



    ticket_type = create_ticket_type(
        event_id,
        ticket_type_data.name,
        ticket_type_data.description,
        ticket_type_data.price,
        ticket_type_data.quantity,
        ticket_type_data.sales_start,
        ticket_type_data.sales_end,
        ticket_type_data.max_per_order,
        db
    )

    log_action(db, user_id, "ticket_type.created", "ticket_type", ticket_type.id,
               f'Created ticket type "{ticket_type.name}" ({ticket_type.price} KZT, {ticket_type.quantity} tickets)', event_id=event_id)

    db.commit()
    db.refresh(ticket_type)

    return ticket_type



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
    max_per_order = ticket_type_data.max_per_order if ticket_type_data.max_per_order is not None else ticket_type.max_per_order

    if sales_start >= sales_end:
        raise InvalidTicketSalesTimeError()

    if quantity < ticket_type.sold_count:
        raise QuantityBelowSoldError()

    # collect the changes before update_ticket_type overwrites the old values
    changes = []
    if price != ticket_type.price:
        changes.append(f"price {ticket_type.price} -> {price} KZT")
    if quantity != ticket_type.quantity:
        changes.append(f"quantity {ticket_type.quantity} -> {quantity}")

    update_ticket_type(ticket_type, name, description, price, quantity, sales_start, sales_end, max_per_order, db)

    description_text = f'Updated ticket type "{name}"'
    if changes:
        description_text += ": " + ", ".join(changes)

    log_action(db, user_id, "ticket_type.updated", "ticket_type", ticket_type.id, description_text, event_id=event.id)

    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def hide_ticket_type_service(user_id: int, ticket_type_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    update_ticket_type_visibility(ticket_type, True, db)
    log_action(db, user_id, "ticket_type.hidden", "ticket_type", ticket_type.id,
               f'Hid ticket type "{ticket_type.name}"', event_id=event.id)

    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def unhide_ticket_type_service(user_id: int, ticket_type_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    update_ticket_type_visibility(ticket_type, False, db)
    log_action(db, user_id, "ticket_type.unhidden", "ticket_type", ticket_type.id,
               f'Unhid ticket type "{ticket_type.name}"', event_id=event.id)

    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def get_ticket_types_for_organizer_service(user_id: int, event_id: int, db: Session):
    # the organizer sees every ticket type of their own event: hidden ones too, and also while it's a draft
    event = ensure_event_owner_service(user_id, event_id, db)

    return get_all_ticket_types_by_event_id(event.id, db)
