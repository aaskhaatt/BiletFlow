from sqlalchemy.orm import Session
from schemas.event import EventCreate, EventUpdate
from services.organizer_service import ensure_organizer_approved_service
from services.audit_service import log_action
from repositories.event_repository import create_event, update_event, get_event_by_id, update_event_status, get_events_by_organizer_id, get_published_events
from exceptions import InvalidEventTimeError, EventAccessDeniedError, InvalidEventStatusError, EventNotReadyToPublishError, EventNotFoundError



def validate_event_times(start_time, end_time, registration_opens_at, registration_closes_at):
    if start_time >= end_time:
        raise InvalidEventTimeError()

    if registration_opens_at is not None and registration_closes_at is not None:
        if registration_opens_at >= registration_closes_at:
            raise InvalidEventTimeError()

    if registration_closes_at is not None:
        if registration_closes_at > end_time:
            raise InvalidEventTimeError()



def create_event_service(user_id: int, event_data: EventCreate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    validate_event_times(event_data.start_time, event_data.end_time, event_data.registration_opens_at, event_data.registration_closes_at)

    event = create_event(organizer.id, event_data.title, event_data.description, event_data.start_time,
                        event_data.end_time, event_data.category, event_data.venue_name, event_data.venue_address,
                        event_data.capacity, event_data.visibility, event_data.registration_opens_at, event_data.registration_closes_at, db)

    # event.id already exists here: the repository's flush() ran the INSERT
    log_action(db, user_id, "event.created", "event", event.id, f'Created event "{event.title}"', event_id=event.id)

    db.commit()
    db.refresh(event)

    return event



def update_event_service(user_id: int, event_id: int, event_data: EventUpdate, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    title = event_data.title if event_data.title is not None else event.title
    start_time = event_data.start_time if event_data.start_time is not None else event.start_time
    end_time = event_data.end_time if event_data.end_time is not None else event.end_time
    description = event_data.description if event_data.description is not None else event.description
    category = event_data.category if event_data.category is not None else event.category
    venue_name = event_data.venue_name if event_data.venue_name is not None else event.venue_name
    venue_address = event_data.venue_address if event_data.venue_address is not None else event.venue_address
    capacity = event_data.capacity if event_data.capacity is not None else event.capacity
    visibility = event_data.visibility if event_data.visibility is not None else event.visibility
    registration_opens_at =event_data.registration_opens_at if event_data.registration_opens_at is not None else event.registration_opens_at
    registration_closes_at = event_data.registration_closes_at if event_data.registration_closes_at is not None else event.registration_closes_at

    validate_event_times(start_time, end_time, registration_opens_at, registration_closes_at)

    # collect the changes before update_event overwrites the old values
    changes = []
    if capacity != event.capacity:
        changes.append(f"capacity {event.capacity} -> {capacity}")
    if start_time != event.start_time:
        changes.append(f"start time {event.start_time.isoformat()} -> {start_time.isoformat()}")
    if visibility != event.visibility:
        changes.append(f"visibility {event.visibility} -> {visibility}")

    update_event(event, title, description, start_time, end_time, category, venue_name, venue_address, capacity, visibility, registration_opens_at, registration_closes_at, db)

    description_text = f'Updated event "{title}"'
    if changes:
        description_text += ": " + ", ".join(changes)

    log_action(db, user_id, "event.updated", "event", event.id, description_text, event_id=event.id)

    db.commit()
    db.refresh(event)

    return event



def publish_event_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    if event.status != "draft":
        raise InvalidEventStatusError()

    if event.venue_name is None or event.venue_address is None:
        raise EventNotReadyToPublishError()

    update_event_status(event, "published", db)
    log_action(db, user_id, "event.published", "event", event.id, f'Published event "{event.title}"', event_id=event.id)

    db.commit()
    db.refresh(event)

    return event


def cancel_event_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    if event.status == "cancelled":
        raise InvalidEventStatusError()

    update_event_status(event, "cancelled", db)
    log_action(db, user_id, "event.cancelled", "event", event.id, f'Cancelled event "{event.title}"', event_id=event.id)

    db.commit()
    db.refresh(event)

    return event



def unpublish_event_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    if event.status != "published":
        raise InvalidEventStatusError()

    update_event_status(event, "draft", db)
    log_action(db, user_id, "event.unpublished", "event", event.id, f'Unpublished event "{event.title}"', event_id=event.id)

    db.commit()
    db.refresh(event)

    return event


def get_my_events_service(user_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    return get_events_by_organizer_id(organizer.id, db)


def get_published_events_service(db: Session):
    return get_published_events(db)


def get_public_event_service(event_id: int, db: Session):
    event = get_event_by_id(event_id, db)

    # 404 instead of 403, so strangers can't tell that a draft or private event exists
    if event.status != "published" or event.visibility == "private":
        raise EventNotFoundError()

    return event