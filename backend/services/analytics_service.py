"""Organizer analytics for one event (SRS 4.15). Read-only: nothing here changes data."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from exceptions import TicketTypeNotFoundError
from repositories.analytics_repository import (get_money_totals, get_daily_sales, get_ticket_type_breakdown,
                                               get_ticket_counts, get_checked_in_by_ticket_type, get_held_tickets)
from repositories.campaign_repository import get_campaigns_by_event_id, get_campaign_stats
from repositories.ticket_type_repository import get_ticket_type_by_id
from services.event_service import ensure_event_owner_service


def _as_utc(moment: datetime | None) -> datetime | None:
    # a date sent without a time zone is read as UTC, like GET /events
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def _percent(part: int, whole: int | None) -> float | None:
    return round(part * 100 / whole, 1) if whole else None


def get_event_analytics_service(user_id: int, event_id: int, date_from: datetime | None, date_to: datetime | None,
                                ticket_type_id: int | None, db: Session) -> dict:
    event = ensure_event_owner_service(user_id, event_id, db)
    date_from, date_to = _as_utc(date_from), _as_utc(date_to)

    ticket_type = None
    if ticket_type_id is not None:
        ticket_type = get_ticket_type_by_id(ticket_type_id, db)
        # another event's ticket type: answer as if it didn't exist
        if ticket_type.event_id != event.id:
            raise TicketTypeNotFoundError()

    types = get_ticket_type_breakdown(event.id, date_from, date_to, db)
    checked_in_by_type = get_checked_in_by_ticket_type(event.id, db)

    # capacity, right now: the type's own limit, or the event's, or the sum of all its types
    counts = get_ticket_counts(event.id, ticket_type_id, db)
    held = get_held_tickets(event.id, ticket_type_id, db)
    if ticket_type is not None:
        capacity, taken = ticket_type.quantity, ticket_type.sold_count
    elif event.capacity is not None:
        capacity, taken = event.capacity, event.tickets_sold
    else:
        capacity, taken = sum(t.quantity for t in types), sum(t.sold_count for t in types)
    # taken = sold + held (the atomic counters), so remaining is what can still be bought
    remaining = max(capacity - taken, 0)

    money = get_money_totals(event.id, date_from, date_to, db)
    campaign_stats = get_campaign_stats(event.id, db, date_from, date_to)
    empty = {"orders": 0, "tickets": 0, "gross": 0, "discount": 0, "net": 0}

    return {
        "event_id": event.id,
        "currency": "KZT",
        "is_simulated": True,
        "filters": {"date_from": date_from, "date_to": date_to, "ticket_type_id": ticket_type_id},
        "capacity": {
            "capacity": capacity,
            "sold": counts.issued,
            "held": held,
            "remaining": remaining,
            "percent_sold": _percent(counts.issued, capacity),
        },
        "money": {
            "gross": money.gross,
            "discounts": money.discounts,
            "refunds": money.refunds,
            "processing_fees": money.processing_fees,
            "net": money.gross - money.refunds - money.processing_fees,
            "paid_orders": money.orders,
        },
        "check_in": {
            "tickets": counts.issued,
            "checked_in": counts.checked_in,
            "percent": _percent(counts.checked_in, counts.issued),
        },
        "sales_over_time": [
            {"date": row.day, "orders": row.orders, "tickets": row.tickets, "revenue": row.revenue}
            for row in get_daily_sales(event.id, date_from, date_to, ticket_type_id, db)
        ],
        "ticket_types": [
            {"ticket_type_id": t.ticket_type_id, "name": t.name, "price": t.price, "quantity": t.quantity,
             "sold": t.sold, "revenue": t.revenue, "held": t.held, "checked_in": checked_in_by_type.get(t.ticket_type_id, 0)}
            for t in types if ticket_type_id is None or t.ticket_type_id == ticket_type_id
        ],
        "campaigns": [
            {"campaign_id": c.id, "code": c.code, "name": c.name, "is_active": c.is_active, "link_opens": c.link_opens,
             **campaign_stats.get(c.id, empty)}
            for c in get_campaigns_by_event_id(event.id, db)
        ],
    }
