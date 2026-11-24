"""Read-only queries for organizer analytics (SRS 4.15). Everything is counted from orders, items and tickets."""
from datetime import datetime, timedelta
from sqlalchemy import Date, and_, case, cast, func, select
from sqlalchemy.orm import Session
from models import Order, OrderItem, Ticket, TicketType
from repositories.order_repository import ORDER_SALE_TIME, sold_between

# days are counted in Kazakhstan time (UTC+5 everywhere since March 2024), so a sale at 23:30 local time
# lands on that day, not the next. A fixed offset, so it doesn't depend on the database's time zone data.
KZ_OFFSET = timedelta(hours=5)
SALE_DAY = cast(func.timezone("UTC", ORDER_SALE_TIME) + KZ_OFFSET, Date)


def get_money_totals(event_id: int, sold_from: datetime | None, sold_to: datetime | None, db: Session):
    # the same definitions as GET /events/{id}/sales, limited to orders sold in the period
    collected = Order.status.in_(["confirmed", "refunded"])
    stmt = select(
        func.coalesce(func.sum(case((collected, Order.total_amount), else_=0)), 0).label("gross"),
        func.coalesce(func.sum(case((Order.status == "confirmed", Order.discount_amount), else_=0)), 0).label("discounts"),
        func.coalesce(func.sum(case((Order.status == "refunded", Order.total_amount), else_=0)), 0).label("refunds"),
        func.coalesce(func.sum(case((Order.status == "confirmed", Order.processing_fee), else_=0)), 0).label("processing_fees"),
        # orders with money in them, like /sales: free registrations are not "paid orders"
        func.count().filter(Order.status == "confirmed", Order.total_amount > 0).label("orders"),
    ).where(Order.event_id == event_id, *sold_between(sold_from, sold_to))

    return db.execute(stmt).one()


def get_daily_sales(event_id: int, sold_from: datetime | None, sold_to: datetime | None, ticket_type_id: int | None,
                    db: Session) -> list:
    """One row per day with sales: paid orders, tickets and revenue.
    Without a ticket type: revenue = what attendees paid (after discounts).
    With one: tickets and revenue of that type only, at its ticket price (a discount belongs to the whole order)."""
    item_filter = [OrderItem.ticket_type_id == ticket_type_id] if ticket_type_id is not None else []
    # per order first, so an order with 2 items isn't counted twice
    items = (select(OrderItem.order_id,
                    func.sum(OrderItem.quantity).label("tickets"),
                    func.sum(OrderItem.quantity * OrderItem.unit_price).label("item_revenue"))
             .where(*item_filter).group_by(OrderItem.order_id).subquery())
    revenue = items.c.item_revenue if ticket_type_id is not None else Order.total_amount
    stmt = (
        select(SALE_DAY.label("day"),
               func.count(Order.id).label("orders"),
               func.sum(items.c.tickets).label("tickets"),
               func.sum(revenue).label("revenue"))
        .join(items, items.c.order_id == Order.id)
        .where(Order.event_id == event_id, Order.status == "confirmed", *sold_between(sold_from, sold_to))
        .group_by(SALE_DAY)
        .order_by(SALE_DAY)
    )

    return db.execute(stmt).all()


def get_ticket_type_breakdown(event_id: int, sold_from: datetime | None, sold_to: datetime | None, db: Session) -> list:
    """Per ticket type: sold and revenue in the period (confirmed orders, at the price paid), held right now."""
    in_period = and_(Order.status == "confirmed", *sold_between(sold_from, sold_to))
    stmt = (
        select(TicketType.id.label("ticket_type_id"), TicketType.name, TicketType.price, TicketType.quantity,
               TicketType.sold_count,
               func.coalesce(func.sum(case((in_period, OrderItem.quantity), else_=0)), 0).label("sold"),
               func.coalesce(func.sum(case((in_period, OrderItem.quantity * OrderItem.unit_price), else_=0)), 0).label("revenue"),
               func.coalesce(func.sum(case((Order.status == "pending", OrderItem.quantity), else_=0)), 0).label("held"))
        .outerjoin(OrderItem, OrderItem.ticket_type_id == TicketType.id)
        .outerjoin(Order, Order.id == OrderItem.order_id)
        .where(TicketType.event_id == event_id)
        .group_by(TicketType.id)
        .order_by(TicketType.id)
    )

    return db.execute(stmt).all()


def get_ticket_counts(event_id: int, ticket_type_id: int | None, db: Session):
    """Right now: valid tickets (unused + used), how many are checked in, per type in a second query."""
    stmt = select(
        func.count().filter(Ticket.status.in_(["valid", "checked_in"])).label("issued"),
        func.count().filter(Ticket.status == "checked_in").label("checked_in"),
    ).where(Ticket.event_id == event_id)
    if ticket_type_id is not None:
        stmt = stmt.where(Ticket.ticket_type_id == ticket_type_id)

    return db.execute(stmt).one()


def get_checked_in_by_ticket_type(event_id: int, db: Session) -> dict[int, int]:
    stmt = (select(Ticket.ticket_type_id, func.count())
            .where(Ticket.event_id == event_id, Ticket.status == "checked_in")
            .group_by(Ticket.ticket_type_id))

    return dict(db.execute(stmt).all())


def get_held_tickets(event_id: int, ticket_type_id: int | None, db: Session) -> int:
    # seats in checkouts that are still being paid
    stmt = (select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.event_id == event_id, Order.status == "pending"))
    if ticket_type_id is not None:
        stmt = stmt.where(OrderItem.ticket_type_id == ticket_type_id)

    return db.scalar(stmt)
