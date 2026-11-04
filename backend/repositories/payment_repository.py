from sqlalchemy.orm import Session
from models import Payment



def create_payment(purpose: str, amount: int, status: str, provider_reference: str, failure_reason: str | None,
                   payer_user_id: int, event_id: int, order_id: int | None, db: Session):
    payment = Payment(
        purpose = purpose,
        amount = amount,
        status = status,
        provider_reference = provider_reference,
        failure_reason = failure_reason,
        payer_user_id = payer_user_id,
        event_id = event_id,
        order_id = order_id
    )

    db.add(payment)
    db.flush()

    return payment
