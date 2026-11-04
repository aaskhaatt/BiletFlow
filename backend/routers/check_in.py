from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.check_in import CheckInRequest, UndoCheckInRequest, CheckInResult, CheckInTicket, CheckInStats
from services.check_in_service import check_in_service, undo_check_in_service, search_tickets_service, check_in_stats_service


router = APIRouter(tags=["check-in"])


@router.post("/events/{event_id}/check-in", response_model=CheckInResult)
def check_in(event_id: int, data: CheckInRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return check_in_service(current_user.id, event_id, data.code, db)


@router.post("/events/{event_id}/check-in/undo", response_model=CheckInTicket)
def undo_check_in(event_id: int, data: UndoCheckInRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return undo_check_in_service(current_user.id, event_id, data.ticket_id, db)


@router.get("/events/{event_id}/check-in/search", response_model=list[CheckInTicket])
def search_tickets(event_id: int, q: str = Query(min_length=2, max_length=100), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return search_tickets_service(current_user.id, event_id, q, db)


@router.get("/events/{event_id}/check-in/stats", response_model=CheckInStats)
def check_in_stats(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return check_in_stats_service(current_user.id, event_id, db)
