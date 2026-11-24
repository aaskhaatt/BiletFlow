from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from services.ticket_service import get_ticket_qr_service, get_ticket_pdf_service, get_order_pdf_service


router = APIRouter(tags=["tickets"])

PDF_RESPONSE = {200: {"content": {"application/pdf": {}}}}


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/pdf", headers={
        # "inline" lets a browser show it in a tab; the file name is used when saving
        "Content-Disposition": f'inline; filename="{filename}"',
        # the QR code inside lets someone in, so no browser or proxy should keep a copy
        "Cache-Control": "no-store",
    })


# returns a PNG image instead of JSON, so the docs page is told the content type explicitly
@router.get("/tickets/{ticket_id}/qr", response_class=Response, responses={200: {"content": {"image/png": {}}}})
def get_ticket_qr(ticket_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    png = get_ticket_qr_service(current_user.id, ticket_id, db)

    return Response(content=png, media_type="image/png")


@router.get("/tickets/{ticket_id}/pdf", response_class=Response, responses=PDF_RESPONSE)
def get_ticket_pdf(ticket_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _pdf(get_ticket_pdf_service(current_user.id, ticket_id, db), f"ticket-{ticket_id}.pdf")


# every valid ticket of the order, one per page
@router.get("/orders/{order_id}/pdf", response_class=Response, responses=PDF_RESPONSE)
def get_order_tickets_pdf(order_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _pdf(get_order_pdf_service(current_user.id, order_id, db), f"order-{order_id}-tickets.pdf")
