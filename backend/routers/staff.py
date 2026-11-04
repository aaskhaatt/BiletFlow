from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.staff import StaffAssign, StaffResponse
from schemas.event import EventResponse
from services.staff_service import assign_staff_service, list_staff_service, remove_staff_service, get_staff_events_service


router = APIRouter(tags=["staff"])


@router.post("/events/{event_id}/staff", response_model=StaffResponse, status_code=201)
def assign_staff(event_id: int, staff_data: StaffAssign, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return assign_staff_service(current_user.id, event_id, staff_data.email, db)


@router.get("/events/{event_id}/staff", response_model=list[StaffResponse])
def list_staff(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_staff_service(current_user.id, event_id, db)


@router.delete("/events/{event_id}/staff/{user_id}", status_code=204)
def remove_staff(event_id: int, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    remove_staff_service(current_user.id, event_id, user_id, db)


# the mobile app's home screen: the events this user may scan for
@router.get("/staff/events", response_model=list[EventResponse])
def get_staff_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_staff_events_service(current_user.id, db)
