import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models.user import User
from schemas.event import EventCreate, EventUpdate, EventDuplicate
from services.organizer_service import ensure_organizer_approved_service
from services.audit_service import log_action
from services.notification_service import notify_event_updated, format_moment
from repositories.audit_repository import get_event_history
from repositories.ticket_type_repository import (get_all_ticket_types_by_event_id, create_ticket_type,
                                                 update_ticket_type_visibility)
from storage import copy_file, delete_file
from repositories.event_repository import (create_event, update_event, get_event_by_id, update_event_status, get_events_by_organizer_id,
                                           get_published_events, get_published_categories, update_event_image)
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

    # only the fields that were sent: one left out keeps its value, one sent as null is cleared
    sent = event_data.model_dump(exclude_unset=True)

    def new(field: str):
        return sent[field] if field in sent else getattr(event, field)

    title, start_time, end_time = new("title"), new("start_time"), new("end_time")
    description, category, capacity, visibility = new("description"), new("category"), new("capacity"), new("visibility")
    venue_name, venue_address = new("venue_name"), new("venue_address")
    registration_opens_at, registration_closes_at = new("registration_opens_at"), new("registration_closes_at")
    refund_policy = new("refund_policy")

    validate_event_times(start_time, end_time, registration_opens_at, registration_closes_at)

    # publishing needs a venue, so a published event can't lose it
    if event.status == "published" and (not venue_name or not venue_address):
        raise EventNotReadyToPublishError()

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


def get_my_events_service(user_id: int, db: Session, lifecycle: str | None = None):
    organizer = ensure_organizer_approved_service(user_id, db)
    events = get_events_by_organizer_id(organizer.id, db)

    # lifecycle depends on the current time, so it's filtered here rather than stored in a column;
    # one organizer's list is small enough for that
    if lifecycle is not None:
        events = [event for event in events if event.lifecycle == lifecycle]

    return events


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


# --- event history and duplication (SRS 4.16) ----------------------------------------------------------------------

def get_event_history_service(user: User, event_id: int, action_type: str | None, action: str | None,
                              date_from: datetime | None, date_to: datetime | None, limit: int, offset: int,
                              db: Session) -> dict:
    # the activity timeline is the audit log of the event: every change, sale, refund and check-in.
    # Its organizer reads it; platform admins too, for moderation and support (SRS 4.16)
    event = get_event_by_id(event_id, db) if user.is_platform_admin else ensure_event_owner_service(user.id, event_id, db)
    rows, total = get_event_history(event.id, action_type, action, _as_utc(date_from), _as_utc(date_to), limit, offset, db)

    return {
        "items": [
            {"id": row.AuditLog.id, "created_at": row.AuditLog.created_at, "action": row.AuditLog.action,
             "type": row.AuditLog.action.split(".")[0], "entity_type": row.AuditLog.entity_type,
             "entity_id": row.AuditLog.entity_id, "description": row.AuditLog.description,
             "actor_user_id": row.AuditLog.actor_user_id, "actor_email": row.actor_email}
            for row in rows
        ],
        "total": total,
    }


def duplicate_event_service(user_id: int, event_id: int, data: EventDuplicate | None, db: Session):
    """Copies an event and its ticket types into a new draft: no orders, sales, staff, promo codes or paid-sales
    activation (that's per event and needs its own fee). A new start_time moves every date by the same amount."""
    source = ensure_event_owner_service(user_id, event_id, db)
    data = data or EventDuplicate()

    shift = data.start_time - source.start_time if data.start_time else timedelta(0)

    def moved(moment: datetime | None) -> datetime | None:
        return moment + shift if moment is not None else None

    title = data.title or source.title
    event = create_event(source.organizer_id, title, source.description, moved(source.start_time), moved(source.end_time),
                         source.category, source.venue_name, source.venue_address, source.capacity, source.visibility,
                         moved(source.registration_opens_at), moved(source.registration_closes_at), db)
    event.refund_policy = source.refund_policy

    ticket_types = get_all_ticket_types_by_event_id(source.id, db)
    for ticket_type in ticket_types:
        copy = create_ticket_type(event.id, ticket_type.name, ticket_type.description, ticket_type.price,
                                  ticket_type.quantity, moved(ticket_type.sales_start), moved(ticket_type.sales_end),
                                  ticket_type.max_per_order, db)
        if ticket_type.is_hidden:
            update_ticket_type_visibility(copy, True, db)

    # the image is copied, not shared: if both events pointed at one file, removing it from one would break the other
    new_key = None
    if source.image_key:
        extension = source.image_key.rsplit(".", 1)[-1]
        new_key = f"events/{event.id}/{secrets.token_hex(16)}.{extension}"
        if copy_file(source.image_key, new_key):
            update_event_image(event, new_key, db)
        else:
            new_key = None

    # one line in each event's history
    log_action(db, user_id, "event.created", "event", event.id,
               f'Created as a copy of "{source.title}" (event #{source.id}) with {len(ticket_types)} ticket type(s)',
               event_id=event.id)
    log_action(db, user_id, "event.duplicated", "event", source.id,
               f'Copied into a new draft "{title}" (event #{event.id})', event_id=source.id)

    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_file(new_key)
        raise
    db.refresh(event)

    return event


def get_event_for_owner_service(user_id: int, event_id: int, db: Session):
    # the organizer's own view of one event, in any status: previewing a draft before publishing (SRS 4.2)
    return ensure_event_owner_service(user_id, event_id, db)
