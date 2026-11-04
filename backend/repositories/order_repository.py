from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select
from models import Order, OrderItem
from exceptions import OrderNotFoundError



def create_order(user_id: int, event_id: int, status: str, total_amount: int, buyer_name: str, buyer_email: str, db: Session):
    order = Order(
        user_id = user_id,
        event_id = event_id,
        status = status,
        total_amount = total_amount,
        buyer_name = buyer_name,
        buyer_email = buyer_email
    )

    db.add(order)
    db.flush()

    return order


def create_order_item(order_id: int, ticket_type_id: int, quantity: int, unit_price: int, db: Session):
    order_item = OrderItem(
        order_id = order_id,
        ticket_type_id = ticket_type_id,
        quantity = quantity,
        unit_price = unit_price
    )

    db.add(order_item)
    db.flush()

    return order_item


def get_order_by_id(order_id: int, db: Session):
    order = db.get(Order, order_id)

    if order is None:
        raise OrderNotFoundError()

    return order


def get_orders_by_user_id(user_id: int, db: Session):
    # selectinload fetches all items and tickets in 2 extra queries in total,
    # instead of 2 extra queries PER order (the "N+1 queries" problem)
    stmt = (
        select(Order)
        .where(Order.user_id == user_id)
        .options(selectinload(Order.items), selectinload(Order.tickets))
        .order_by(Order.created_at.desc())
    )

    return db.scalars(stmt).all()
