from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from services.ticket_service import get_ticket_qr_service


router = APIRouter(tags=["tickets"])


# returns a PNG image instead of JSON, so the docs page is told the content type explicitly
@router.get("/tickets/{ticket_id}/qr", response_class=Response, responses={200: {"content": {"image/png": {}}}})
def get_ticket_qr(ticket_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    png = get_ticket_qr_service(current_user.id, ticket_id, db)

    return Response(content=png, media_type="image/png")
