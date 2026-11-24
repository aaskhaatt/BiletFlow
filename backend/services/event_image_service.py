"""Event cover images: upload/replace and remove, organizer only (SRS 4.2)."""
import secrets
from sqlalchemy.orm import Session
from exceptions import ImageTooLargeError
from models import Event
from repositories.event_repository import lock_event, update_event_image
from services.audit_service import log_action
from services.event_service import ensure_event_owner_service
from storage import MAX_IMAGE_BYTES, detect_image_type, upload_file, delete_file


def upload_event_image_service(user_id: int, event_id: int, data: bytes, db: Session) -> Event:
    ensure_event_owner_service(user_id, event_id, db)

    if len(data) > MAX_IMAGE_BYTES:
        raise ImageTooLargeError()
    content_type, extension = detect_image_type(data)

    # 1. upload first, without holding any database lock: storage can be slow
    new_key = f"events/{event_id}/{secrets.token_hex(16)}.{extension}"
    upload_file(new_key, data, content_type)

    try:
        # 2. lock the event, so two uploads at once can't both think they replace the same old image
        event = lock_event(event_id, db)
        old_key = event.image_key
        update_event_image(event, new_key, db)
        log_action(db, user_id, "event.image_updated", "event", event.id,
                   "Replaced the cover image" if old_key else "Added a cover image", event_id=event.id)
        db.commit()
    except Exception:
        # the database didn't take the new image, so don't leave its file behind
        db.rollback()
        delete_file(new_key)
        raise

    db.refresh(event)
    # 3. only now, with the new image saved, remove the old file
    delete_file(old_key)

    return event


def delete_event_image_service(user_id: int, event_id: int, db: Session) -> Event:
    ensure_event_owner_service(user_id, event_id, db)
    event = lock_event(event_id, db)
    old_key = event.image_key

    # removing an image that isn't there is fine: the result is the same, so it isn't an error
    if old_key is not None:
        update_event_image(event, None, db)
        log_action(db, user_id, "event.image_removed", "event", event.id, "Removed the cover image", event_id=event.id)

    db.commit()
    db.refresh(event)
    delete_file(old_key)

    return event
