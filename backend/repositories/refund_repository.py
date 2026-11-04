from sqlalchemy.orm import Session
from models import Refund



def create_refund(order_id: int, payment_id: int | None, event_id: int, amount: int, provider_reference: str,
                  reason: str | None, initiated_by_user_id: int, db: Session):
    refund = Refund(
        order_id = order_id,
        payment_id = payment_id,
        event_id = event_id,
        amount = amount,
        provider_reference = provider_reference,
        reason = reason,
        initiated_by_user_id = initiated_by_user_id
    )

    db.add(refund)
    db.flush()

    return refund
