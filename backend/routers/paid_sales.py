from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.paid_sales import PaidSalesStatusResponse, PayFeeRequest, PaymentResponse
from services.paid_sales_service import (get_paid_sales_status_service, accept_terms_service,
                                         pay_activation_fee_service, activate_paid_sales_service)


router = APIRouter(tags=["paid-sales"])


# the activation checklist (SRS 4.5)
@router.get("/events/{event_id}/paid-sales", response_model=PaidSalesStatusResponse)
def get_paid_sales_status(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_paid_sales_status_service(current_user.id, event_id, db)


@router.post("/events/{event_id}/paid-sales/accept-terms", response_model=PaidSalesStatusResponse)
def accept_paid_sales_terms(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return accept_terms_service(current_user.id, event_id, db)


@router.post("/events/{event_id}/paid-sales/pay-fee", response_model=PaymentResponse)
def pay_activation_fee(event_id: int, data: PayFeeRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return pay_activation_fee_service(current_user.id, event_id, data.simulate_outcome, db)


@router.post("/events/{event_id}/paid-sales/activate", response_model=PaidSalesStatusResponse)
def activate_paid_sales(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return activate_paid_sales_service(current_user.id, event_id, db)
