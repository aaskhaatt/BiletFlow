from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models.user import User
from schemas.order import OrderCreate
from repositories.event_repository import get_event_by_id, reserve_event_capacity
from repositories.ticket_type_repository import get_ticket_type_by_id, reserve_ticket_type_inventory
from repositories.order_repository import create_order, create_order_item, get_order_by_id, get_orders_by_user_id
from repositories.ticket_repository import create_ticket, get_attendees_by_event_id
from repositories.paid_sales_repository import is_paid_sales_active
from services.audit_service import log_action
from services.organizer_service import ensure_organizer_approved_service
from security import generate_ticket_code
from exceptions import (EventNotFoundError, EventAccessDeniedError, RegistrationClosedError, TicketTypeNotFoundError,
                        TicketTypeNotAvailableError, PaidTicketsNotAvailableError, InvalidOrderQuantityError,
                        TicketTypeSoldOutError, EventSoldOutError, OrderNotFoundError, PaidSalesNotActiveError)



def create_free_order_service(user: User, event_id: int, order_data: OrderCreate, db: Session):
    now = datetime.now(timezone.utc)
    event = get_event_by_id(event_id, db)

    # 1. the event must be open for registration
    # drafts and private events answer 404, the same as the public event page
    if event.status != "published" or event.visibility == "private":
        raise EventNotFoundError()

    if event.registration_opens_at is not None and now < event.registration_opens_at:
        raise RegistrationClosedError()

    registration_closes_at = event.registration_closes_at or event.end_time
    if now > registration_closes_at:
        raise RegistrationClosedError()

    # 2. every requested ticket type must be valid for this order
    ticket_type_ids = [item.ticket_type_id for item in order_data.items]
    if len(ticket_type_ids) != len(set(ticket_type_ids)):
        raise InvalidOrderQuantityError()

    requested = []
    for item in order_data.items:
        try:
            ticket_type = get_ticket_type_by_id(item.ticket_type_id, db)
        except TicketTypeNotFoundError:
            raise TicketTypeNotAvailableError()

        if ticket_type.event_id != event.id or ticket_type.is_hidden:
            raise TicketTypeNotAvailableError()

        if not (ticket_type.sales_start <= now <= ticket_type.sales_end):
            raise TicketTypeNotAvailableError()

        if ticket_type.price > 0:
            # paid tickets need activated (and not suspended) paid sales for this event (SRS 4.5)...
            if not is_paid_sales_active(event.id, db):
                raise PaidSalesNotActiveError()
            # ...and the paid checkout itself comes in Feature 5
            raise PaidTicketsNotAvailableError()

        if item.quantity > ticket_type.max_per_order:
            raise InvalidOrderQuantityError()

        requested.append((ticket_type, item.quantity))

    # 3. reserve inventory atomically
    # if anything below raises, nothing was committed, so get_db rolls these reservations back too
    for ticket_type, quantity in requested:
        if reserve_ticket_type_inventory(ticket_type.id, quantity, db) is None:
            raise TicketTypeSoldOutError()

    total_quantity = sum(quantity for _, quantity in requested)
    if reserve_event_capacity(event.id, total_quantity, db) is None:
        raise EventSoldOutError()

    # 4. create the order, its items and one ticket per seat
    order = create_order(user.id, event.id, "confirmed", 0, order_data.buyer_name, user.email, db)

    for ticket_type, quantity in requested:
        order_item = create_order_item(order.id, ticket_type.id, quantity, ticket_type.price, db)

        for _ in range(quantity):
            create_ticket(generate_ticket_code(), order.id, order_item.id, ticket_type.id, event.id, order_data.buyer_name, db)

    # 5. log, then ONE commit: reservation, order, items, tickets and log are saved together or not at all
    log_action(db, user.id, "order.created", "order", order.id,
               f"Registered {total_quantity} free ticket(s), order #{order.id}", event_id=event.id)

    db.commit()
    db.refresh(order)

    return order



def get_my_orders_service(user_id: int, db: Session):
    return get_orders_by_user_id(user_id, db)



def get_order_service(user_id: int, order_id: int, db: Session):
    order = get_order_by_id(order_id, db)

    # 404 instead of 403: other people's orders shouldn't even be confirmed to exist
    if order.user_id != user_id:
        raise OrderNotFoundError()

    return order



def get_event_attendees_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    return get_attendees_by_event_id(event_id, db)
