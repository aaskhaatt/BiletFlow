from sqlalchemy.orm import Session
from sqlalchemy import select, update, func, or_, case
from models import Ticket, TicketType, Order, CheckInRecord, User



def check_in_ticket(code: str, event_id: int, db: Session):
    # ONE statement: "mark as used, but only if it is still valid".
    # Two scanners at two doors can't both admit the same ticket: the second UPDATE waits for the
    # row lock, then sees status = 'checked_in' and matches nothing.
    stmt = (
        update(Ticket)
        .where(Ticket.code == code, Ticket.event_id == event_id, Ticket.status == "valid")
        .values(status="checked_in", checked_in_at=func.now())
        .returning(Ticket.id)
    )

    # the ticket id, or None if nothing was checked in
    return db.execute(stmt).scalar()


def undo_check_in(ticket_id: int, event_id: int, db: Session):
    # the same pattern in reverse: only a checked-in ticket can be made valid again
    stmt = (
        update(Ticket)
        .where(Ticket.id == ticket_id, Ticket.event_id == event_id, Ticket.status == "checked_in")
        .values(status="valid", checked_in_at=None)
        .returning(Ticket.id)
    )

    return db.execute(stmt).scalar()


def create_check_in_record(ticket_id: int, event_id: int, staff_user_id: int, action: str, db: Session):
    record = CheckInRecord(ticket_id=ticket_id, event_id=event_id, staff_user_id=staff_user_id, action=action)

    db.add(record)
    db.flush()

    return record


def _ticket_details():
    # the columns the scanner screen shows: who, which ticket type, what state
    return (
        select(
            Ticket.id, Ticket.code, Ticket.event_id, Ticket.attendee_name, Ticket.status, Ticket.checked_in_at,
            TicketType.name.label("ticket_type_name"), _checked_in_by(),
        )
        .join(TicketType, Ticket.ticket_type_id == TicketType.id)
    )


def get_ticket_details_by_code(code: str, db: Session):
    return db.execute(_ticket_details().where(Ticket.code == code)).first()


def get_ticket_details_by_id(ticket_id: int, db: Session):
    return db.execute(_ticket_details().where(Ticket.id == ticket_id)).first()


def search_tickets(event_id: int, query: str, db: Session):
    # ILIKE = case-insensitive LIKE; "%aig%" matches "Aigerim"
    pattern = f"%{query}%"
    stmt = (
        _ticket_details()
        .join(Order, Ticket.order_id == Order.id)
        .where(Ticket.event_id == event_id,
               or_(Ticket.attendee_name.ilike(pattern), Order.buyer_email.ilike(pattern), Ticket.code == query))
        .order_by(Ticket.attendee_name)
        .limit(20)
    )

    return db.execute(stmt).all()


def get_ticket_status_counts(event_id: int, db: Session) -> dict[str, int]:
    # one GROUP BY query: {"valid": 120, "checked_in": 80, ...}
    stmt = select(Ticket.status, func.count()).where(Ticket.event_id == event_id).group_by(Ticket.status)

    return {status: count for status, count in db.execute(stmt).all()}


def _checked_in_by():
    # the email of whoever made the latest check-in of this ticket; only meaningful while it's checked in
    latest = (select(User.email)
              .join(CheckInRecord, CheckInRecord.staff_user_id == User.id)
              .where(CheckInRecord.ticket_id == Ticket.id, CheckInRecord.action == "check_in")
              .order_by(CheckInRecord.id.desc()).limit(1)
              .correlate(Ticket).scalar_subquery())
    return case((Ticket.status == "checked_in", latest), else_=None).label("checked_in_by")
