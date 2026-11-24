from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Order


def get_ticket_holder_emails(event_id: int, db: Session) -> list[str]:
    # people with a confirmed order for the event, each once (someone with 3 orders gets 1 email)
    stmt = (select(Order.buyer_email).distinct()
            .where(Order.event_id == event_id, Order.status == "confirmed")
            .order_by(Order.buyer_email))

    return list(db.scalars(stmt))
