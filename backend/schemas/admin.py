from datetime import datetime
from typing import Generic, TypeVar
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class SuspendRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_platform_admin: bool
    email_verified_at: datetime | None
    suspended_at: datetime | None
    suspension_reason: str | None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int


class AdminOrderRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int | None
    status: str
    total_amount: int
    processing_fee: int
    buyer_name: str
    buyer_email: str
    created_at: datetime
    paid_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None


class AdminPaymentRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    purpose: str
    amount: int
    currency: str
    status: str
    is_simulated: bool
    provider_reference: str
    failure_reason: str | None
    payer_user_id: int | None
    event_id: int
    order_id: int | None
    created_at: datetime


class AdminRefundRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    event_id: int
    amount: int
    currency: str
    status: str
    is_simulated: bool
    provider_reference: str
    reason: str | None
    initiated_by_user_id: int | None
    created_at: datetime
