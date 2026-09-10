from sqlalchemy.orm import Session
from schemas.event import EventCreate, EventUpdate
from services.organizer_service import ensure_organizer_approved_service
from repositories.event_repository import create_event, update_event, get_event_by_id, update_event_status, get_events_by_organizer_id, get_published_events
from exceptions import InvalidEventTimeError, EventAccessDeniedError



def create_event_service(user_id: int, event_data: EventCreate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    if event_data.end_time <= event_data.start_time:
        raise InvalidEventTimeError()

    return create_event(organizer.id, event_data.title, event_data.description, event_data.start_time, event_data.end_time, db)



def update_event_service(user_id: int, event_id: int, event_data: EventUpdate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    title = event_data.title if event_data.title is not None else event.title
    start_time = event_data.start_time if event_data.start_time is not None else event.start_time
    end_time = event_data.end_time if event_data.end_time is not None else event.end_time
    description = event_data.description if event_data.description is not None else event.description

    
    if start_time >= end_time:
        raise InvalidEventTimeError()

    
    return update_event(event, title, description, start_time, end_time, db)



def publish_event_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    return update_event_status(event, "published", db)


def cancel_event_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    return update_event_status(event, "cancelled", db)



def get_my_events_service(user_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    return get_events_by_organizer_id(organizer.id, db)


def get_published_events_service(db: Session):
    return get_published_events(db)