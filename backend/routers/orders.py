from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.order import OrderCreate, OrderResponse, AttendeeResponse, PayOrderRequest, SalesSummaryResponse
from services.order_service import (create_order_service, pay_order_service, get_my_orders_service, get_order_service,
                                    get_event_attendees_service, get_event_sales_service)


router = APIRouter(tags=["orders"])


@router.post("/events/{event_id}/orders", response_model=OrderResponse, status_code=201)
def create_order(event_id: int, order_data: OrderCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_order_service(current_user, event_id, order_data, db)


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
