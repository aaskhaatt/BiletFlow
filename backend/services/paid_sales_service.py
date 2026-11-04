from datetime import datetime, timezone
from sqlalchemy.orm import Session
from repositories.paid_sales_repository import (get_activation_by_event_id, ensure_activation, lock_activation,
                                                change_activation_status, list_activations)
from repositories.payout_repository import get_payout_account_by_organizer_id
from repositories.ticket_type_repository import event_has_paid_ticket_type
from repositories.event_repository import get_event_by_id
from services.event_service import ensure_event_owner_service
from services.payment_service import simulate_payment, SimulatedOutcome
from services.settings_service import get_activation_fee
from services.audit_service import log_action
from exceptions import (InvalidEventStatusError, ActivationFeeAlreadyPaidError, PaymentFailedError,
                        ActivationRequirementsNotMetError, InvalidActivationStatusError, PaidSalesNotFoundError)



def _paid_sales_status(event, db: Session):
    # the checklist the organizer sees (SRS 4.5); recomputed from the real data every time
    activation = get_activation_by_event_id(event.id, db)
    checklist = {
        "has_paid_ticket_type": event_has_paid_ticket_type(event.id, db),
        "identity_verified": event.organizer.identity_verified_at is not None,
        "payout_account_connected": get_payout_account_by_organizer_id(event.organizer_id, db) is not None,
        "terms_accepted": activation is not None and activation.terms_accepted_at is not None,
        "fee_paid": activation is not None and activation.fee_paid_at is not None,
    }
    status = activation.status if activation is not None else "not_started"
    # once paid, show what was actually paid; before that, the current platform fee
    fee_amount = activation.fee_amount if activation is not None and activation.fee_amount is not None else get_activation_fee(db)

    return {
        "event_id": event.id,
        "status": status,
        "fee_amount": fee_amount,
        "currency": "KZT",
        "is_simulated": True,
        "checklist": checklist,
        "can_activate": status in ("not_started", "pending") and event.status != "cancelled" and all(checklist.values()),
        "activated_at": activation.activated_at if activation else None,
        "suspended_at": activation.suspended_at if activation else None,
        "suspension_reason": activation.suspension_reason if activation else None,
    }



def get_paid_sales_status_service(user_id: int, event_id: int, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)

    return _paid_sales_status(event, db)



def accept_terms_service(user_id: int, event_id: int, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)
    activation = ensure_activation(event.id, db)

    # accepting twice is harmless: keep the first acceptance time
    if activation.terms_accepted_at is None:
        activation.terms_accepted_at = datetime.now(timezone.utc)
        log_action(db, user_id, "paid_sales.terms_accepted", "event", event.id, "Accepted the paid-event terms", event_id=event.id)

    db.commit()

    return _paid_sales_status(event, db)



def pay_activation_fee_service(user_id: int, event_id: int, outcome: SimulatedOutcome, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)

    if event.status == "cancelled":
        raise InvalidEventStatusError()

    ensure_activation(event.id, db)
    # lock the row for the whole payment: a double-clicked "Pay" button waits here,
    # then sees fee_paid_at is set and is refused BEFORE it could charge a second time
    activation = lock_activation(event.id, db)

    if activation.fee_paid_at is not None:
        raise ActivationFeeAlreadyPaidError()

    amount = get_activation_fee(db)
    payment = simulate_payment("activation_fee", amount, outcome, user_id, event.id, db)

    if payment.status == "failed":
        log_action(db, user_id, "paid_sales.fee_payment_failed", "payment", payment.id,
                   f"Simulated activation fee payment of {amount} KZT failed", event_id=event.id)
        # commit BEFORE raising: a failed attempt must stay on record (an error would roll it back)
        db.commit()
        raise PaymentFailedError()

    activation.fee_amount = amount
    activation.fee_paid_at = datetime.now(timezone.utc)
    activation.fee_payment_id = payment.id
    log_action(db, user_id, "paid_sales.fee_paid", "payment", payment.id,
               f"Paid simulated activation fee of {amount} KZT ({payment.provider_reference})", event_id=event.id)
    db.commit()
    db.refresh(payment)

    return payment



def activate_paid_sales_service(user_id: int, event_id: int, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)
    status = _paid_sales_status(event, db)

    if status["status"] not in ("not_started", "pending") or event.status == "cancelled":
        raise InvalidActivationStatusError()

    if not all(status["checklist"].values()):
        raise ActivationRequirementsNotMetError()

    # atomic pending -> active; activation applies to this one event only
    if change_activation_status(event.id, "pending", {"status": "active", "activated_at": datetime.now(timezone.utc)}, db) is None:
        raise InvalidActivationStatusError()

    log_action(db, user_id, "paid_sales.activated", "event", event.id, "Activated paid ticket sales", event_id=event.id)
    db.commit()

    return _paid_sales_status(event, db)



# --- platform admin ---------------------------------------------------------------------------

def list_activations_service(status: str | None, db: Session):
    return list_activations(status, db)



def suspend_paid_sales_service(admin_user_id: int, event_id: int, reason: str, db: Session):
    event = get_event_by_id(event_id, db)

    if get_activation_by_event_id(event.id, db) is None:
        raise PaidSalesNotFoundError()

    values = {"status": "suspended", "suspended_at": datetime.now(timezone.utc), "suspension_reason": reason}
    if change_activation_status(event.id, "active", values, db) is None:
        raise InvalidActivationStatusError()

    log_action(db, admin_user_id, "paid_sales.suspended", "event", event.id, f"Suspended paid sales: {reason}", event_id=event.id)
    db.commit()

    return _paid_sales_status(event, db)



def reinstate_paid_sales_service(admin_user_id: int, event_id: int, db: Session):
    event = get_event_by_id(event_id, db)

    if get_activation_by_event_id(event.id, db) is None:
        raise PaidSalesNotFoundError()

    values = {"status": "active", "suspended_at": None, "suspension_reason": None}
    if change_activation_status(event.id, "suspended", values, db) is None:
        raise InvalidActivationStatusError()

    log_action(db, admin_user_id, "paid_sales.reinstated", "event", event.id, "Reinstated paid sales", event_id=event.id)
    db.commit()

    return _paid_sales_status(event, db)
