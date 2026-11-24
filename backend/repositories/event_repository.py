from sqlalchemy.orm import Session
from models import Event
from exceptions import EventNotFoundError
from datetime import datetime
from sqlalchemy import select, update, or_



def get_event_by_id(event_id: int, db: Session):
    event = db.get(Event, event_id)

    if event is None:
        raise EventNotFoundError()

    return event



def create_event(organizer_id: int, title: str, description: str | None, start_time: datetime, end_time: datetime, 
            category: str | None, venue_name: str | None, venue_address: str | None, 
            capacity: int | None, visibility: str, registration_opens_at: datetime, 
            registration_closes_at: datetime, db: Session):

    new_event = Event(
        organizer_id = organizer_id,
        title = title,
        description = description,
        start_time = start_time,
        end_time = end_time,
        category = category,
        venue_name = venue_name,
        venue_address = venue_address,
        capacity = capacity,
        visibility = visibility,
        registration_opens_at = registration_opens_at,
        registration_closes_at = registration_closes_at
    )

    db.add(new_event)
    db.flush()

    return new_event


def update_event(event: Event, title: str, description: str | None, start_time: datetime, end_time: datetime, 
            category: str | None, venue_name: str | None, venue_address: str | None, 
            capacity: int | None, visibility: str, registration_opens_at: datetime, 
            registration_closes_at: datetime, db: Session):

    event.title = title
    event.description = description
    event.start_time = start_time
    event.end_time = end_time
    event.category = category
    event.venue_name = venue_name
    event.venue_address = venue_address
    event.capacity = capacity
    event.visibility = visibility
    event.registration_opens_at = registration_opens_at
    event.registration_closes_at = registration_closes_at

    db.flush()

    return event



def get_published_events(db: Session):
    stmt = select(Event).where(Event.status == "published", Event.visibility == "public", Event.suspended_at.is_(None))

    published_events = db.scalars(stmt).all()

    return published_events


def get_events_by_organizer_id(organizer_id: int, db: Session):

    stmt = select(Event).where(Event.organizer_id == organizer_id)

    events = db.scalars(stmt).all()

    return events


def update_event_status(event: Event, status: str, db: Session):

    event.status = status

    db.flush()

    return event


def reserve_event_capacity(event_id: int, quantity: int, db: Session) -> int | None:
    # same idea as reserve_ticket_type_inventory, for the event-wide capacity (None = unlimited)
    stmt = (
        update(Event)
        # status check: a buyer waiting behind an event cancellation must not get in once it's cancelled
        .where(Event.id == event_id, Event.status == "published",
               or_(Event.capacity.is_(None), Event.tickets_sold + quantity <= Event.capacity))
        .values(tickets_sold=Event.tickets_sold + quantity)
        .returning(Event.tickets_sold)
    )

    return db.execute(stmt).scalar()


def release_event_capacity(event_id: int, quantity: int, db: Session):
    stmt = (
        update(Event)
        .where(Event.id == event_id, Event.tickets_sold >= quantity)
        .values(tickets_sold=Event.tickets_sold - quantity)
    )
    db.execute(stmt)


def lock_event(event_id: int, db: Session) -> Event:
    # LOCK ORDER RULE: whenever a transaction locks several of these, it locks the EVENT first,
    # then its ORDERS, then TICKET TYPES. Same order everywhere = no deadlocks (see CLAUDE.md).
    stmt = select(Event).where(Event.id == event_id).with_for_update().execution_options(populate_existing=True)
    event = db.scalars(stmt).first()

    if event is None:
        raise EventNotFoundError()

    return event
