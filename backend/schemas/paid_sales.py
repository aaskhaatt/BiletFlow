from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Literal


class ActivationChecklist(BaseModel):
    has_paid_ticket_type: bool
    identity_verified: bool
    payout_account_connected: bool
    terms_accepted: bool
    fee_paid: bool


class PaidSalesStatusResponse(BaseModel):
    event_id: int
    status: Literal["not_started", "pending", "active", "suspended"]
    fee_amount: int
    currency: str
    is_simulated: bool
    checklist: ActivationChecklist
    can_activate: bool
    activated_at: datetime | None
    suspended_at: datetime | None
    suspension_reason: str | None


class PayFeeRequest(BaseModel):
    # simulation only: lets the demo show both a successful and a declined payment
    simulate_outcome: Literal["success", "failure"] = "success"


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    purpose: str
    amount: int
    currency: str
    status: str
    provider: str
    provider_reference: str
    is_simulated: bool
    created_at: datetime


class SuspendPaidSalesRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ActivationRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: int
    event_title: str
    status: str
    fee_amount: int | None
    fee_paid_at: datetime | None
    activated_at: datetime | None
    suspended_at: datetime | None
    suspension_reason: str | None


class PlatformSettingsResponse(BaseModel):
    activation_fee_kzt: int


class ActivationFeeUpdate(BaseModel):
    amount_kzt: int = Field(ge=0)
