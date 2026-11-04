from datetime import datetime, timezone
from sqlalchemy.orm import Session
from repositories.event_repository import lock_event, update_event_status
from repositories.order_repository import get_order_by_id, lock_order, lock_open_orders_for_event
from repositories.ticket_repository import set_order_tickets_status
from repositories.payment_repository import get_succeeded_payment_for_order
from services.order_service import release_order_inventory
from services.event_service import ensure_event_owner_service
from services.payment_service import simulate_refund
from services.audit_service import log_action
from exceptions import (OrderNotFoundError, OrderNotCancellableError, OrderNotRefundableError, InvalidEventStatusError,
                        OrganizerNotFoundError, OrganizerNotApprovedError, EventAccessDeniedError)



def _is_event_owner(user_id: int, event_id: int, db: Session) -> bool:
    try:
        ensure_event_owner_service(user_id, event_id, db)
        return True
    except (OrganizerNotFoundError, OrganizerNotApprovedError, EventAccessDeniedError):
        return False



def _lock_event_then_order(order_id: int, db: Session):
    # we change the order AND the event's counters, so we need both locks.
    # Lock order rule: EVENT first, then ORDER. An order's event_id never changes, so reading it unlocked is safe.
    event_id = get_order_by_id(order_id, db).event_id
    event = lock_event(event_id, db)
    order = lock_order(order_id, db)

    return event, order



def _cancel_order(order, actor_user_id: int, reason: str | None, db: Session):
    # the order and its event must already be locked
    order.status = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)
    tickets = set_order_tickets_status(order.id, "cancelled", db)
    released = release_order_inventory(order.id, db)

    description = f"Cancelled order #{order.id}: {tickets} ticket(s) invalidated, {released} back on sale"
    log_action(db, actor_user_id, "order.cancelled", "order", order.id,
               description + (f" ({reason})" if reason else ""), event_id=order.event_id)



def _refund_order(order, actor_user_id: int, reason: str | None, db: Session):
    # the order and its event must already be locked; full refunds only (partial refunds are out of MVP scope)
    payment = get_succeeded_payment_for_order(order.id, db)
    refund = simulate_refund(order, payment, reason, actor_user_id, db)

    order.status = "refunded"
    order.refunded_at = datetime.now(timezone.utc)
    tickets = set_order_tickets_status(order.id, "refunded", db)
    release_order_inventory(order.id, db)

    log_action(db, actor_user_id, "order.refunded", "refund", refund.id,
               f"Refunded {order.total_amount} KZT for order #{order.id} ({refund.provider_reference}); "
               f"{tickets} ticket(s) invalidated" + (f" ({reason})" if reason else ""), event_id=order.event_id)



def cancel_order_service(user_id: int, order_id: int, reason: str | None, db: Session):
    order = get_order_by_id(order_id, db)

    # the buyer may cancel their own order; the event's organizer may cancel any order of the event
    if order.user_id != user_id and not _is_event_owner(user_id, order.event_id, db):
        raise OrderNotFoundError()

    event, order = _lock_event_then_order(order_id, db)

    # pending checkouts and free registrations can simply be cancelled;
    # paid orders must be REFUNDED instead, because money has to go back
    is_free_registration = order.status == "confirmed" and order.total_amount == 0
    if order.status != "pending" and not is_free_registration:
        raise OrderNotCancellableError()

    _cancel_order(order, user_id, reason, db)
    db.commit()
    db.refresh(order)

    return order



def refund_order_service(user_id: int, order_id: int, reason: str, db: Session):
    order = get_order_by_id(order_id, db)

    # SRS 4.9: only authorized organizers initiate refunds
    if not _is_event_owner(user_id, order.event_id, db):
        if order.user_id == user_id:
            # the buyer exists in this order's story, so "forbidden" is honest; strangers just get 404
            raise EventAccessDeniedError()
        raise OrderNotFoundError()

    event, order = _lock_event_then_order(order_id, db)

    if order.status != "confirmed" or order.total_amount == 0:
        raise OrderNotRefundableError()

    _refund_order(order, user_id, reason, db)
    db.commit()
    db.refresh(order)

    return order



def cancel_event_service(user_id: int, event_id: int, db: Session):
    ensure_event_owner_service(user_id, event_id, db)

    # lock order rule: event, then all its open orders. Buyers trying to reserve now wait for the event
    # lock and are refused once we commit; a payment in progress finishes first, then gets refunded here.
    event = lock_event(event_id, db)

    if event.status == "cancelled":
        raise InvalidEventStatusError()

    update_event_status(event, "cancelled", db)

    refunded, cancelled = 0, 0
    for order in lock_open_orders_for_event(event.id, db):
        if order.status == "confirmed" and order.total_amount > 0:
            _refund_order(order, user_id, "Event cancelled", db)
            refunded += 1
        else:
            _cancel_order(order, user_id, "Event cancelled", db)
            cancelled += 1

    log_action(db, user_id, "event.cancelled", "event", event.id,
               f'Cancelled event "{event.title}": {refunded} paid order(s) refunded, {cancelled} other order(s) cancelled',
               event_id=event.id)

    # ONE commit: the event and every order are cancelled/refunded together, or nothing is
    db.commit()
    db.refresh(event)

    return event
