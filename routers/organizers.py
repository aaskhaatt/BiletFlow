from fastapi import APIRouter, Depends
from dependencies import get_current_user
from database import get_db
from models import User
from schemas.organizer import OrganizerResponse
from sqlalchemy.orm import Session
from services.organizer_service import apply_for_organizer_service, approve_organizer_service
from dependencies import require_platform_admin


router = APIRouter(prefix="/organizers", tags=["organizers"])


@router.post("/apply", response_model=OrganizerResponse)
def apply_for_organizer(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    return apply_for_organizer_service(current_user.id, db)


@router.patch("/{user_id}/approve", response_model=OrganizerResponse)
def approve_organizer(user_id: int, current_admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return approve_organizer_service(user_id, db)
    