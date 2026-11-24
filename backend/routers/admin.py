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
from fastapi import Query, Response
from services.campaign_service import search_campaigns_service
from schemas.admin import AdminCampaignRow
from schemas.admin import (AdminOrderRow, AdminPaymentRow, AdminRefundRow, AdminUserResponse, EventReportResponse,
                           EventReportReview, Page, SuspendRequest)
from schemas.event import EventResponse
from services.admin_service import (suspend_user_service, unsuspend_user_service, suspend_event_service,
                                    unsuspend_event_service, search_users_service, search_events_service,
                                    search_orders_service, search_payments_service, search_refunds_service, rows_to_csv,
                                    search_event_reports_service, review_event_report_service)


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


# --- Dev B: search and monitoring lists (Feature 13) ---
# Each answers {items, total}; ?format=csv exports every matching row (limit/offset ignored).
# shortcut: CSV export is unpaged; fine at demo scale, stream it if tables grow large.

Format = Literal["json", "csv"]
Limit = Query(50, ge=1, le=200)
Offset = Query(0, ge=0)


def _page(result, schema, format: str, name: str):
    rows, total = result
    if format == "csv":
        return Response(rows_to_csv(rows, schema), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})
    return {"items": rows, "total": total}


def _limit(format: str, limit: int):
    return None if format == "csv" else limit


@router.get("/users", response_model=Page[AdminUserResponse])
def search_users(q: str | None = None, suspended: bool | None = None, limit: int = Limit, offset: int = Offset,
                 format: Format = "json", admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_users_service(q, suspended, _limit(format, limit), offset, db), AdminUserResponse, format, "users")


@router.get("/events", response_model=Page[EventResponse])
def search_events(q: str | None = None, status: Literal["draft", "published", "cancelled"] | None = None,
                  suspended: bool | None = None, limit: int = Limit, offset: int = Offset, format: Format = "json",
                  admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_events_service(q, status, suspended, _limit(format, limit), offset, db), EventResponse, format, "events")


@router.get("/orders", response_model=Page[AdminOrderRow])
def search_orders(q: str | None = None,
                  status: Literal["pending", "confirmed", "cancelled", "refunded", "expired"] | None = None,
                  event_id: int | None = None, limit: int = Limit, offset: int = Offset, format: Format = "json",
                  admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_orders_service(q, status, event_id, _limit(format, limit), offset, db), AdminOrderRow, format, "orders")


# status=failed is the failed-payment monitor
@router.get("/payments", response_model=Page[AdminPaymentRow])
def search_payments(q: str | None = None, status: Literal["succeeded", "failed"] | None = None,
                    purpose: Literal["order", "activation_fee"] | None = None, event_id: int | None = None,
                    limit: int = Limit, offset: int = Offset, format: Format = "json",
                    admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_payments_service(q, status, purpose, event_id, _limit(format, limit), offset, db),
                 AdminPaymentRow, format, "payments")


@router.get("/refunds", response_model=Page[AdminRefundRow])
def search_refunds(q: str | None = None, event_id: int | None = None, limit: int = Limit, offset: int = Offset,
                   format: Format = "json", admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_refunds_service(q, event_id, _limit(format, limit), offset, db), AdminRefundRow, format, "refunds")


# --- Dev B: reported events (Feature 13) ---

@router.get("/event-reports", response_model=Page[EventReportResponse])
def search_event_reports(status: Literal["open", "dismissed", "actioned"] | None = None, event_id: int | None = None,
                         limit: int = Limit, offset: int = Offset, format: Format = "json",
                         admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_event_reports_service(status, event_id, _limit(format, limit), offset, db),
                 EventReportResponse, format, "event-reports")


@router.post("/event-reports/{report_id}/review", response_model=EventReportResponse)
def review_event_report(report_id: int, data: EventReportReview, admin: User = Depends(require_platform_admin),
                        db: Session = Depends(get_db)):
    return review_event_report_service(admin.id, report_id, data.status, data.note, db)


# --- promo-code activity across all events (SRS 4.12) ---

@router.get("/campaigns", response_model=Page[AdminCampaignRow])
def search_campaigns(q: str | None = Query(None, max_length=100, description="Code, campaign name or event title"),
                     event_id: int | None = None, active: bool | None = None, limit: int = Limit, offset: int = Offset,
                     format: Format = "json", admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return _page(search_campaigns_service(q, event_id, active, _limit(format, limit), offset, db),
                 AdminCampaignRow, format, "campaigns")
