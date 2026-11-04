from sqlalchemy.orm import Session
from sqlalchemy import select
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


def get_succeeded_payment_for_order(order_id: int, db: Session) -> Payment | None:
    stmt = select(Payment).where(Payment.order_id == order_id, Payment.status == "succeeded")

    return db.scalars(stmt).first()
