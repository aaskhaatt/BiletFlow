from datetime import datetime, timezone
from sqlalchemy.orm import Session
from schemas.event import EventCreate, EventUpdate
from services.organizer_service import ensure_organizer_approved_service
from services.audit_service import log_action
from services.notification_service import notify_event_updated, format_moment
from repositories.event_repository import (create_event, update_event, get_event_by_id, update_event_status, get_events_by_organizer_id,
                                           get_published_events, get_published_categories)
from exceptions import InvalidEventTimeError, EventAccessDeniedError, InvalidEventStatusError, EventNotReadyToPublishError, EventNotFoundError, QuantityBelowSoldError



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

    event.refund_policy = event_data.refund_policy

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
    refund_policy = event_data.refund_policy if event_data.refund_policy is not None else event.refund_policy

    validate_event_times(start_time, end_time, registration_opens_at, registration_closes_at)

    if capacity is not None and capacity < event.tickets_sold:
        raise QuantityBelowSoldError()

    # collect the changes before update_event overwrites the old values
    changes = []
    if capacity != event.capacity:
        changes.append(f"capacity {event.capacity} -> {capacity}")
    if start_time != event.start_time:
        changes.append(f"start time {event.start_time.isoformat()} -> {start_time.isoformat()}")
    if visibility != event.visibility:
        changes.append(f"visibility {event.visibility} -> {visibility}")

    # what attendees need to know, collected before update_event overwrites the old values
    attendee_changes = []
    if start_time != event.start_time:
        attendee_changes.append(f"Starts: {format_moment(event.start_time)} -> {format_moment(start_time)}")
    if end_time != event.end_time:
        attendee_changes.append(f"Ends: {format_moment(event.end_time)} -> {format_moment(end_time)}")
    old_venue = ", ".join(part for part in (event.venue_name, event.venue_address) if part)
    new_venue = ", ".join(part for part in (venue_name, venue_address) if part)
    if new_venue != old_venue:
        attendee_changes.append(f"Where: {old_venue or 'not set'} -> {new_venue or 'not set'}")
    was_published = event.status == "published"

    update_event(event, title, description, start_time, end_time, category, venue_name, venue_address, capacity, visibility, registration_opens_at, registration_closes_at, db)
    event.refund_policy = refund_policy

    description_text = f'Updated event "{title}"'
    if changes:
        description_text += ": " + ", ".join(changes)

    log_action(db, user_id, "event.updated", "event", event.id, description_text, event_id=event.id)

    # only a published event has attendees to tell; a typo fix in the description emails nobody
    if was_published and attendee_changes:
        notify_event_updated(db, event, attendee_changes)

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


def _as_utc(moment: datetime | None) -> datetime | None:
    # a date sent without a timezone ("2026-12-01T00:00:00") is read as UTC, so comparisons never mix the two kinds
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def get_published_events_service(db: Session, q: str | None = None, category: str | None = None,
                                 date_from: datetime | None = None, date_to: datetime | None = None,
                                 include_past: bool = False, limit: int = 20, offset: int = 0) -> dict:
    q = q.strip() if q else None
    category = category.strip() if category else None
    # by default the catalogue shows only events that haven't ended yet
    ended_before = None if include_past else datetime.now(timezone.utc)

    items, total = get_published_events(db, q=q or None, category=category or None,
                                        date_from=_as_utc(date_from), date_to=_as_utc(date_to),
                                        ended_before=ended_before, limit=limit, offset=offset)

    return {"items": items, "total": total}


def get_event_categories_service(db: Session) -> list[str]:
    return get_published_categories(datetime.now(timezone.utc), db)


def get_public_event_service(event_id: int, db: Session):
    event = get_event_by_id(event_id, db)

    # 404 instead of 403, so strangers can't tell that a draft or private event exists
    if event.status != "published" or event.visibility == "private" or event.suspended_at is not None:
        raise EventNotFoundError()

    return event


def ensure_event_owner_service(user_id: int, event_id: int, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)
    event = get_event_by_id(event_id, db)

    if organizer.id != event.organizer_id:
        raise EventAccessDeniedError()

    return event
