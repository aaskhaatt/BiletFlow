from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.analytics import EventAnalyticsResponse
from services.analytics_service import get_event_analytics_service


router = APIRouter(tags=["analytics"])


# the organizer's dashboard for one event (SRS 4.15); event organizer only
@router.get("/events/{event_id}/analytics", response_model=EventAnalyticsResponse)
def get_event_analytics(event_id: int,
                        date_from: datetime | None = Query(None, description="Sales at or after this moment"),
                        date_to: datetime | None = Query(None, description="Sales before this moment"),
                        ticket_type_id: int | None = Query(None, description="Ticket counts for one type only"),
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_event_analytics_service(current_user.id, event_id, date_from, date_to, ticket_type_id, db)
