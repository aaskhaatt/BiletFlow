from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models import User
from schemas.admin import EventReportCreate, EventReportResponse
from services.admin_service import report_event_service


# attendees report events here; admins review them under /admin/event-reports
router = APIRouter(tags=["reports"])


@router.post("/events/{event_id}/reports", response_model=EventReportResponse, status_code=201)
def report_event(event_id: int, data: EventReportCreate, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    return report_event_service(current_user.id, event_id, data, db)
