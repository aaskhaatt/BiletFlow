from datetime import datetime, timezone
from sqlalchemy.orm import Session
from repositories.paid_sales_repository import is_paid_sales_active
from services.event_service import ensure_event_owner_service, get_public_event_page_service
from schemas.ticket_type import TicketTypeCreate, TicketTypeUpdate, TicketTypeResponse
from repositories.ticket_type_repository import (create_ticket_type, get_ticket_types_by_event_id, update_ticket_type, get_ticket_type_by_id,
                                                 update_ticket_type_visibility, get_all_ticket_types_by_event_id)
from services.organizer_service import ensure_organizer_approved_service
from services.audit_service import log_action
from repositories.event_repository import get_event_by_id
from exceptions import InvalidEventStatusError, InvalidTicketSalesTimeError, EventAccessDeniedError, QuantityBelowSoldError
from models.ticket_type import TicketType


def create_ticket_type_service(user_id: int, event_id: int, ticket_type_data: TicketTypeCreate, db: Session) -> TicketType:
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    # a cancelled event's ticket types can be read, not changed
    if event.status == "cancelled":
        raise InvalidEventStatusError()

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
    # same visibility rule as the public event page: drafts and private events answer 404
    # same rules as the public event page: a once-public cancelled event still lists its types (not on sale)
    event = get_public_event_page_service(event_id, db)

    return _with_availability(event, get_ticket_types_by_event_id(event.id, db), db)


def update_ticket_type_service(user_id: int, ticket_type_id: int, ticket_type_data: TicketTypeUpdate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    ticket_type = get_ticket_type_by_id(ticket_type_id, db)
    event = get_event_by_id(ticket_type.event_id, db)


    if event.organizer_id != organizer.id:
        raise EventAccessDeniedError()

    if event.status == "cancelled":
        raise InvalidEventStatusError()


    # only the fields that were sent: one left out keeps its value, a description sent as null is cleared
    sent = ticket_type_data.model_dump(exclude_unset=True)

    def new(field: str):
        return sent[field] if field in sent else getattr(ticket_type, field)

    name, description, price, quantity = new("name"), new("description"), new("price"), new("quantity")
    sales_start, sales_end, max_per_order = new("sales_start"), new("sales_end"), new("max_per_order")

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

    if event.status == "cancelled":
        raise InvalidEventStatusError()

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

    if event.status == "cancelled":
        raise InvalidEventStatusError()

    update_ticket_type_visibility(ticket_type, False, db)
    log_action(db, user_id, "ticket_type.unhidden", "ticket_type", ticket_type.id,
               f'Unhid ticket type "{ticket_type.name}"', event_id=event.id)

    db.commit()
    db.refresh(ticket_type)

    return ticket_type


def get_ticket_types_for_organizer_service(user_id: int, event_id: int, db: Session):
    # the organizer sees every ticket type of their own event: hidden ones too, and also while it's a draft
    event = ensure_event_owner_service(user_id, event_id, db)

    return _with_availability(event, get_all_ticket_types_by_event_id(event.id, db), db)


def _with_availability(event, ticket_types, db: Session) -> list[dict]:
    """Each ticket type plus whether it can be bought now, using the same rules as ordering (order_service)."""
    now = datetime.now(timezone.utc)
    paid_active = is_paid_sales_active(event.id, db)
    registration_open = (event.status == "published" and event.visibility != "private" and event.suspended_at is None
                         and (event.registration_opens_at is None or now >= event.registration_opens_at)
                         and now <= (event.registration_closes_at or event.end_time))
    event_left = None if event.capacity is None else max(event.capacity - event.tickets_sold, 0)

    result = []
    for ticket_type in ticket_types:
        left = max(ticket_type.quantity - ticket_type.sold_count, 0)
        available = left if event_left is None else min(left, event_left)
        if not registration_open:
            reason = "registration_closed"
        elif ticket_type.is_hidden:
            reason = "hidden"
        elif now < ticket_type.sales_start:
            reason = "not_started"
        elif now > ticket_type.sales_end:
            reason = "ended"
        elif ticket_type.price > 0 and not paid_active:
            reason = "paid_sales_inactive"
        elif available == 0:
            reason = "sold_out"
        else:
            reason = None
        result.append({**TicketTypeResponse.model_validate(ticket_type).model_dump(), "available": available,
                       "max_now": min(available, ticket_type.max_per_order) if reason is None else 0,
                       "on_sale": reason is None, "unavailable_reason": reason})
    return result
