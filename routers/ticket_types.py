from fastapi import APIRouter, Depends
from dependencies import get_current_user
from database import get_db
from sqlalchemy.orm import Session
from models.user import User
from schemas.ticket_type import TicketTypeCreate, TicketTypeResponse
from services.ticket_type_service import create_ticket_type_service



router = APIRouter(tags=["ticket-types"])


@router.post("/events/{event_id}/ticket-type", response_model=TicketTypeResponse, status_code=201)
def create_ticket_type_router(event_id: int, ticket_type_data: TicketTypeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    return create_ticket_type_service(current_user.id, event_id, ticket_type_data, db)