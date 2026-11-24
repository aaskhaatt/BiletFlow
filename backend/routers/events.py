from datetime import datetime
from fastapi import APIRouter, Depends, Query, UploadFile, File
from schemas.event import EventResponse, EventCreate, EventUpdate, EventPage
from database import get_db
from sqlalchemy.orm import Session
from models.user import User
from dependencies import get_current_user
from services.event_service import (create_event_service, get_published_events_service, get_my_events_service, update_event_service,
                                    publish_event_service, unpublish_event_service, get_public_event_service, get_event_categories_service)
from services.cancellation_service import cancel_event_service
from services.event_image_service import upload_event_image_service, delete_event_image_service
from storage import MAX_IMAGE_BYTES

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model = EventResponse)
def create_event(event_data: EventCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_event_service(current_user.id, event_data, db)


@router.get("", response_model=EventPage)
def get_events(q: str | None = Query(None, max_length=100, description="Text in the title, description, venue name or address"),
               category: str | None = Query(None, max_length=100, description="Exact category, case-insensitive"),
               date_from: datetime | None = Query(None, description="Events starting at or after this moment"),
               date_to: datetime | None = Query(None, description="Events starting before this moment"),
               include_past: bool = Query(False, description="Also show events that have already ended"),
               limit: int = Query(20, ge=1, le=100),
               offset: int = Query(0, ge=0),
               db: Session = Depends(get_db)):
    return get_published_events_service(db, q=q, category=category, date_from=date_from, date_to=date_to,
                                        include_past=include_past, limit=limit, offset=offset)


@router.get("/me", response_model=list[EventResponse])
def get_my_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_my_events_service(current_user.id, db)


# also above /{event_id}: the categories of upcoming public events, for the filter dropdown
@router.get("/categories", response_model=list[str])
def get_event_categories(db: Session = Depends(get_db)):
    return get_event_categories_service(db)


# must stay below /me, otherwise "/events/me" would be matched as an event_id
@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    return get_public_event_service(event_id, db)



@router.patch("/{event_id}", response_model=EventResponse)
def update_event(event_id: int, event_data: EventUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return update_event_service(current_user.id, event_id, event_data, db)



@router.patch("/{event_id}/publish", response_model=EventResponse)
def publish_event(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return publish_event_service(current_user.id, event_id, db)



@router.patch("/{event_id}/cancel", response_model=EventResponse)
def cancel_event(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return cancel_event_service(current_user.id, event_id, db)



@router.patch("/{event_id}/unpublish", response_model=EventResponse)
def unpublish_event(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return unpublish_event_service(current_user.id, event_id, db)


# multipart/form-data with the image in a field named "file": JPEG, PNG or WebP, at most 5 MB. Replaces any old image.
@router.put("/{event_id}/image", response_model=EventResponse)
def upload_event_image(event_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    # read one byte more than allowed, so a too-large file is detected without reading all of it
    return upload_event_image_service(current_user.id, event_id, file.file.read(MAX_IMAGE_BYTES + 1), db)


@router.delete("/{event_id}/image", response_model=EventResponse)
def delete_event_image(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return delete_event_image_service(current_user.id, event_id, db)
