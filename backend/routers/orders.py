from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.order import (OrderCreate, OrderResponse, AttendeeResponse, PayOrderRequest, SalesSummaryResponse, EventOrderPage,
                           CancelOrderRequest, RefundOrderRequest)
from services.cancellation_service import cancel_order_service, refund_order_service
from schemas.campaign import OrderPreviewRequest, OrderPreviewResponse
from services.order_service import (create_order_service, pay_order_service, get_my_orders_service, get_order_service,
                                    get_event_attendees_service, get_event_sales_service, preview_order_service,
                                    get_event_orders_service)


router = APIRouter(tags=["orders"])


@router.post("/events/{event_id}/orders", response_model=OrderResponse, status_code=201)
def create_order(event_id: int, order_data: OrderCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_order_service(current_user, event_id, order_data, db)


# the checkout screen's price check, promo code included; reserves nothing
@router.post("/events/{event_id}/orders/preview", response_model=OrderPreviewResponse)
def preview_order(event_id: int, preview_data: OrderPreviewRequest, current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    return preview_order_service(event_id, preview_data, db)


# must stay above /orders/{order_id}, otherwise "me" would be read as an order_id
@router.get("/orders/me", response_model=list[OrderResponse])
def get_my_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_my_orders_service(current_user.id, db)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_order_service(current_user.id, order_id, db)


@router.get("/events/{event_id}/attendees", response_model=list[AttendeeResponse])
def get_event_attendees(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_event_attendees_service(current_user.id, event_id, db)


@router.post("/orders/{order_id}/pay", response_model=OrderResponse)
def pay_order(order_id: int, data: PayOrderRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return pay_order_service(current_user.id, order_id, data.simulate_outcome, db)


@router.get("/events/{event_id}/sales", response_model=SalesSummaryResponse)
def get_event_sales(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_event_sales_service(current_user.id, event_id, db)


# the buyer cancels their pending checkout or free registration; the organizer may cancel any of those
@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(order_id: int, data: CancelOrderRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return cancel_order_service(current_user.id, order_id, data.reason, db)


# only the event's organizer; full refund of a paid order (simulated)
@router.post("/orders/{order_id}/refund", response_model=OrderResponse)
def refund_order(order_id: int, data: RefundOrderRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return refund_order_service(current_user.id, order_id, data.reason, db)


# the organizer's order list with payment and refund details (SRS 4.16, success criteria)
@router.get("/events/{event_id}/orders", response_model=EventOrderPage)
def get_event_orders(event_id: int,
                     status: Literal["pending", "confirmed", "cancelled", "refunded", "expired"] | None = None,
                     q: str | None = Query(None, max_length=100, description="Buyer name or email"),
                     limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_event_orders_service(current_user.id, event_id, status, q, limit, offset, db)
