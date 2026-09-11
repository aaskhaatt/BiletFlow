from fastapi import APIRouter, Depends
from schemas.event import EventResponse, EventCreate, EventUpdate
from database import get_db
from sqlalchemy.orm import Session
from models.user import User
from dependencies import get_current_user
from services.event_service import create_event_service, get_published_events_service, get_my_events_service, update_event_service, publish_event_service, cancel_event_service

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model = EventResponse)
def create_event(event_data: EventCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_event_service(current_user.id, event_data, db)


@router.get("", response_model=list[EventResponse])
def get_events(db: Session = Depends(get_db)):
    return get_published_events_service(db)


@router.get("/me", response_model=list[EventResponse])
def get_my_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_my_events_service(current_user.id, db)



@router.patch("/{event_id}", response_model=EventResponse)
def update_event(event_id: int, event_data: EventUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return update_event_service(current_user.id, event_id, event_data, db)



@router.patch("/{event_id}/publish", response_model=EventResponse)
def publish_event(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return publish_event_service(current_user.id, event_id, db)



@router.patch("/{event_id}/cancel", response_model=EventResponse)
def cancel_event(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return cancel_event_service(current_user.id, event_id, db)