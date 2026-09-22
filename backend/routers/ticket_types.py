from fastapi import APIRouter, Depends
from dependencies import get_current_user
from database import get_db
from sqlalchemy.orm import Session
from models.user import User
from schemas.ticket_type import TicketTypeCreate, TicketTypeResponse, TicketTypeUpdate
from services.ticket_type_service import create_ticket_type_service, get_ticket_types_by_event_id_service, update_ticket_type_service, hide_ticket_type_service, unhide_ticket_type_service



router = APIRouter(tags=["ticket-types"])


@router.post("/events/{event_id}/ticket-type", response_model=TicketTypeResponse, status_code=201)
def create_ticket_type_router(event_id: int, ticket_type_data: TicketTypeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    return create_ticket_type_service(current_user.id, event_id, ticket_type_data, db)


@router.get("/events/{event_id}/ticket-types", response_model = list[TicketTypeResponse])
def get_ticket_types_by_event_id(event_id: int, db: Session = Depends(get_db)):

    return get_ticket_types_by_event_id_service(event_id, db)


@router.patch("/ticket-types/{ticket_type_id}", response_model=TicketTypeResponse)
def update_ticket_type_router(ticket_type_id: int, ticket_type_data: TicketTypeUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return update_ticket_type_service(current_user.id, ticket_type_id, ticket_type_data, db)


@router.patch("/ticket_types/{ticket_type_id}/hide", response_model=TicketTypeResponse)
def hide_ticket_type_router(ticket_type_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return hide_ticket_type_service(current_user.id, ticket_type_id, db)


@router.patch("/ticket_types/{ticket_type_id}/unhide", response_model=TicketTypeResponse)
def unhide_ticket_type_router(ticket_type_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return unhide_ticket_type_service(current_user.id, ticket_type_id, db)