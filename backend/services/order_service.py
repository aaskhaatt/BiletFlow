import os
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models.user import User
from schemas.order import OrderCreate
from repositories.event_repository import get_event_by_id, reserve_event_capacity, release_event_capacity, lock_event
from repositories.ticket_type_repository import get_ticket_type_by_id, reserve_ticket_type_inventory, release_ticket_type_inventory
from repositories.order_repository import (create_order, create_order_item, get_order_by_id, get_orders_by_user_id, lock_order,
                                           get_order_items, claim_overdue_orders, get_sales_totals, get_ticket_type_sales,
                                           get_events_with_overdue_orders)
from repositories.ticket_repository import create_ticket, get_attendees_by_event_id
from repositories.paid_sales_repository import is_paid_sales_active
from services.audit_service import log_action
from services.organizer_service import ensure_organizer_approved_service
from services.event_service import ensure_event_owner_service
from services.payment_service import simulate_payment, SimulatedOutcome
from security import generate_ticket_code
from exceptions import (EventNotFoundError, EventAccessDeniedError, RegistrationClosedError, TicketTypeNotFoundError,
                        TicketTypeNotAvailableError, InvalidOrderQuantityError, TicketTypeSoldOutError, EventSoldOutError,
                        OrderNotFoundError, PaidSalesNotActiveError, OrderNotPayableError, OrderExpiredError, PaymentFailedError)

# how long a paid checkout keeps its tickets reserved while the attendee pays
ORDER_HOLD_MINUTES = int(os.getenv("ORDER_HOLD_MINUTES", "10"))
# deducted from the organizer's payout; the attendee pays exactly the ticket prices
PROCESSING_FEE_PERCENT = 3



def calculate_processing_fee(total_amount: int) -> int:
    # 3%, rounded to the nearest whole tenge, with integer math only (no floats for money)
    return (total_amount * PROCESSING_FEE_PERCENT + 50) // 100



def _issue_tickets(order, db: Session):
    # one ticket per seat; only ever called for confirmed orders (free, or paid successfully)
    for item in get_order_items(order.id, db):
        for _ in range(item.quantity):
            create_ticket(generate_ticket_code(), order.id, item.id, item.ticket_type_id, order.event_id, order.buyer_name, db)



def release_order_inventory(order_id: int, db: Session) -> int:
    # gives an order's tickets back on sale (expired, cancelled or refunded orders); returns how many.
    # lock order rule: EVENT first, then TICKET TYPES
    order = get_order_by_id(order_id, db)
    items = get_order_items(order_id, db)
    total_quantity = sum(item.quantity for item in items)

    release_event_capacity(order.event_id, total_quantity, db)
    for item in items:
        release_ticket_type_inventory(item.ticket_type_id, item.quantity, db)

    return total_quantity



def expire_overdue_orders_service(db: Session, event_id: int | None = None) -> int:
    # used by the background sweeper (all events) and before every new order (one event)
    expired = 0

    for overdue_event_id in get_events_with_overdue_orders(event_id, db):
        # lock order rule: event, then its orders (the claim), then ticket types (the release)
        lock_event(overdue_event_id, db)

        # claim (pending -> expired) and release in one transaction, so each hold is released exactly once
        for order_id in claim_overdue_orders(overdue_event_id, db):
            released = release_order_inventory(order_id, db)
            log_action(db, None, "order.expired", "order", order_id,
                       f"Checkout hold expired; released {released} ticket(s) of order #{order_id}", event_id=overdue_event_id)
            expired += 1

        db.commit()

    return expired



def create_order_service(user: User, event_id: int, order_data: OrderCreate, db: Session):
    now = datetime.now(timezone.utc)
    event = get_event_by_id(event_id, db)

    # 0. give abandoned holds back first, in their OWN commit: if this order then fails (e.g. sold out),
    #    its rollback must not undo the release
    expire_overdue_orders_service(db, event_id=event.id)

    # 1. the event must be open for registration
    # drafts, private and suspended events answer 404, the same as the public event page
    if event.status != "published" or event.visibility == "private" or event.suspended_at is not None:
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

        # paid tickets need activated (and not suspended) paid sales for this event (SRS 4.5)
        if ticket_type.price > 0 and not is_paid_sales_active(event.id, db):
            raise PaidSalesNotActiveError()

        if item.quantity > ticket_type.max_per_order:
            raise InvalidOrderQuantityError()

        requested.append((ticket_type, item.quantity))

    # 3. reserve inventory atomically: the EVENT first, then TICKET TYPES (lock order rule)
    # if anything below raises, nothing was committed, so get_db rolls these reservations back too
    total_quantity = sum(quantity for _, quantity in requested)
    if reserve_event_capacity(event.id, total_quantity, db) is None:
        # either full, or the event was cancelled while we waited for its lock: re-read it to know which
        db.refresh(event)
        if event.status != "published":
            raise EventNotFoundError()
        raise EventSoldOutError()

    for ticket_type, quantity in requested:
        if reserve_ticket_type_inventory(ticket_type.id, quantity, db) is None:
            raise TicketTypeSoldOutError()

    # 4. free orders are confirmed right away; paid orders wait for payment with a time limit
    total_amount = sum(ticket_type.price * quantity for ticket_type, quantity in requested)
    is_free = total_amount == 0
    order = create_order(
        user.id, event.id,
        status = "confirmed" if is_free else "pending",
        total_amount = total_amount,
        processing_fee = calculate_processing_fee(total_amount),
        expires_at = None if is_free else now + timedelta(minutes=ORDER_HOLD_MINUTES),
        buyer_name = order_data.buyer_name,
        buyer_email = user.email,
        db = db
    )

    for ticket_type, quantity in requested:
        create_order_item(order.id, ticket_type.id, quantity, ticket_type.price, db)

    # SRS 4.6: tickets only exist after payment, so a paid order gets none yet
    if is_free:
        _issue_tickets(order, db)
        description = f"Registered {total_quantity} free ticket(s), order #{order.id}"
    else:
        description = f"Started checkout for {total_quantity} ticket(s), {total_amount} KZT, order #{order.id}"

    # 5. log, then ONE commit: reservation, order, items, tickets and log are saved together or not at all
    log_action(db, user.id, "order.created", "order", order.id, description, event_id=event.id)

    db.commit()
    db.refresh(order)

    return order



def pay_order_service(user_id: int, order_id: int, outcome: SimulatedOutcome, db: Session):
    now = datetime.now(timezone.utc)

    # lock the order for the whole payment: a double-clicked "Pay" waits here, then sees it's already paid
    order = lock_order(order_id, db)

    if order.user_id != user_id:
        raise OrderNotFoundError()

    if order.status == "expired":
        raise OrderExpiredError()

    if order.status != "pending":
        raise OrderNotPayableError()

    if order.expires_at <= now:
        # the hold ran out but the sweeper hasn't reached it yet. We only refuse: releasing here would lock
        # the event AFTER the order (wrong lock order). The sweeper, or the next buyer's step 0, releases it.
        raise OrderExpiredError()

    # an admin may have suspended paid sales while the attendee was paying
    if not is_paid_sales_active(order.event_id, db):
        raise PaidSalesNotActiveError()

    payment = simulate_payment("order", order.total_amount, outcome, user_id, order.event_id, db, order_id=order.id)

    if payment.status == "failed":
        log_action(db, user_id, "order.payment_failed", "payment", payment.id,
                   f"Simulated payment of {order.total_amount} KZT failed for order #{order.id}", event_id=order.event_id)
        # commit BEFORE raising so the failed attempt stays on record; the order stays pending and can be retried
        db.commit()
        raise PaymentFailedError()

    order.status = "confirmed"
    order.paid_at = now
    _issue_tickets(order, db)
    log_action(db, user_id, "order.paid", "payment", payment.id,
               f"Paid {order.total_amount} KZT for order #{order.id} ({payment.provider_reference})", event_id=order.event_id)

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



def get_event_sales_service(user_id: int, event_id: int, db: Session):
    # SRS 4.6: organizers see gross sales, fees, refunds and estimated payouts (all simulated money)
    event = ensure_event_owner_service(user_id, event_id, db)
    totals = get_sales_totals(event.id, db)

    return {
        "event_id": event.id,
        "currency": "KZT",
        "is_simulated": True,
        "gross_sales": totals.gross_sales,
        "processing_fees": totals.processing_fees,
        "refunds": totals.refunds,
        "estimated_payout": totals.gross_sales - totals.processing_fees - totals.refunds,
        "paid_orders": totals.paid_orders,
        "ticket_types": [
            {
                "ticket_type_id": row.ticket_type_id,
                "name": row.name,
                "price": row.price,
                "quantity": row.quantity,
                "sold": row.sold,
                "reserved": row.reserved,
                "available": row.quantity - row.sold_count,
            }
            for row in get_ticket_type_sales(event.id, db)
        ],
    }
