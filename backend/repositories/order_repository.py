from datetime import datetime
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, update, func, case
from models import Order, OrderItem, TicketType
from exceptions import OrderNotFoundError



def create_order(user_id: int, event_id: int, status: str, total_amount: int, processing_fee: int,
                 expires_at: datetime | None, buyer_name: str, buyer_email: str, db: Session):
    order = Order(
        user_id = user_id,
        event_id = event_id,
        status = status,
        total_amount = total_amount,
        processing_fee = processing_fee,
        expires_at = expires_at,
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


def lock_order(order_id: int, db: Session) -> Order:
    # SELECT ... FOR UPDATE: a second "Pay" click waits here until the first one is finished.
    # populate_existing so we never read a stale cached copy after waiting (see CLAUDE.md)
    stmt = select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
    order = db.scalars(stmt).first()

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


def get_order_items(order_id: int, db: Session) -> list[OrderItem]:
    return db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()


def claim_overdue_orders(event_id: int | None, db: Session) -> list[int]:
    # ONE statement both finds and marks the overdue holds, so each one is released exactly once,
    # even if the background sweeper and a buyer's request run at the same moment
    stmt = (
        update(Order)
        .where(Order.status == "pending", Order.expires_at < func.now())
        .values(status="expired")
        .returning(Order.id)
    )
    if event_id is not None:
        stmt = stmt.where(Order.event_id == event_id)

    return list(db.execute(stmt).scalars().all())


def get_sales_totals(event_id: int, db: Session):
    # money for the organizer dashboard: gross includes refunded orders (the money was collected once)
    collected = Order.status.in_(["confirmed", "refunded"])
    stmt = select(
        func.coalesce(func.sum(case((collected, Order.total_amount), else_=0)), 0).label("gross_sales"),
        func.coalesce(func.sum(case((collected, Order.processing_fee), else_=0)), 0).label("processing_fees"),
        func.coalesce(func.sum(case((Order.status == "refunded", Order.total_amount), else_=0)), 0).label("refunds"),
        func.count().filter(Order.status == "confirmed", Order.total_amount > 0).label("paid_orders"),
    ).where(Order.event_id == event_id)

    return db.execute(stmt).one()


def get_ticket_type_sales(event_id: int, db: Session):
    # per ticket type: how many are sold (paid or free, confirmed) and how many are only held (pending)
    sold = func.coalesce(func.sum(case((Order.status == "confirmed", OrderItem.quantity), else_=0)), 0)
    reserved = func.coalesce(func.sum(case((Order.status == "pending", OrderItem.quantity), else_=0)), 0)
    stmt = (
        select(TicketType.id.label("ticket_type_id"), TicketType.name, TicketType.price, TicketType.quantity,
               TicketType.sold_count, sold.label("sold"), reserved.label("reserved"))
        .outerjoin(OrderItem, OrderItem.ticket_type_id == TicketType.id)
        .outerjoin(Order, Order.id == OrderItem.order_id)
        .where(TicketType.event_id == event_id)
        .group_by(TicketType.id)
        .order_by(TicketType.id)
    )

    return db.execute(stmt).all()
