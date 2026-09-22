from sqlalchemy.orm import Session
from models import Event
from exceptions import EventNotFoundError
from datetime import datetime
from sqlalchemy import select



def get_event_by_id(event_id: int, db: Session):
    event = db.get(Event, event_id)

    if event is None:
        raise EventNotFoundError()

    return event



def create_event(organizer_id: int, title: str, description: str | None, start_time: datetime, end_time: datetime, db: Session):

    new_event = Event(
        organizer_id = organizer_id,
        title = title,
        description = description,
        start_time = start_time,
        end_time = end_time
    )

    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    return new_event


def update_event(event: Event, title: str, description: str | None, start_time: datetime, end_time: datetime, db: Session):

    event.title = title
    event.description = description
    event.start_time = start_time
    event.end_time = end_time

    db.commit()
    db.refresh(event)

    return event



def get_published_events(db: Session):
    stmt = select(Event).where(Event.status == "published")

    published_events = db.scalars(stmt).all()

    return published_events


def get_events_by_organizer_id(organizer_id: int, db: Session):

    stmt = select(Event).where(Event.organizer_id == organizer_id)

    events = db.scalars(stmt).all()

    return events


def update_event_status(event: Event, status: str, db: Session):

    event.status = status

    db.commit()
    db.refresh(event)

    return event