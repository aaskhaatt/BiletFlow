from typing import Literal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import require_platform_admin
from models.user import User
from schemas.paid_sales import (ActivationRecord, SuspendPaidSalesRequest, PaidSalesStatusResponse,
                                PlatformSettingsResponse, ActivationFeeUpdate)
from services.paid_sales_service import list_activations_service, suspend_paid_sales_service, reinstate_paid_sales_service
from services.settings_service import get_settings_service, set_activation_fee_service
# --- Dev B: admin tools (Feature 13) ---
from schemas.admin import AdminUserResponse, SuspendRequest
from schemas.event import EventResponse
from services.admin_service import (suspend_user_service, unsuspend_user_service, suspend_event_service,
                                    unsuspend_event_service)


# every route here requires a platform admin (403 for everyone else)
router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/paid-sales", response_model=list[ActivationRecord])
def list_paid_sales_activations(status: Literal["pending", "active", "suspended"] | None = None,
                                admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return list_activations_service(status, db)


@router.post("/events/{event_id}/paid-sales/suspend", response_model=PaidSalesStatusResponse)
def suspend_paid_sales(event_id: int, data: SuspendPaidSalesRequest, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return suspend_paid_sales_service(admin.id, event_id, data.reason, db)


@router.post("/events/{event_id}/paid-sales/reinstate", response_model=PaidSalesStatusResponse)
def reinstate_paid_sales(event_id: int, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return reinstate_paid_sales_service(admin.id, event_id, db)


@router.get("/settings", response_model=PlatformSettingsResponse)
def get_platform_settings(admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return get_settings_service(db)


@router.put("/settings/activation-fee", response_model=PlatformSettingsResponse)
def set_activation_fee(data: ActivationFeeUpdate, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return set_activation_fee_service(admin.id, data.amount_kzt, db)


# --- Dev B: suspensions (Feature 13) ---

@router.post("/users/{user_id}/suspend", response_model=AdminUserResponse)
def suspend_user(user_id: int, data: SuspendRequest, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return suspend_user_service(admin.id, user_id, data.reason, db)


@router.post("/users/{user_id}/unsuspend", response_model=AdminUserResponse)
def unsuspend_user(user_id: int, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return unsuspend_user_service(admin.id, user_id, db)


@router.post("/events/{event_id}/suspend", response_model=EventResponse)
def suspend_event(event_id: int, data: SuspendRequest, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return suspend_event_service(admin.id, event_id, data.reason, db)


@router.post("/events/{event_id}/unsuspend", response_model=EventResponse)
def unsuspend_event(event_id: int, admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return unsuspend_event_service(admin.id, event_id, db)
