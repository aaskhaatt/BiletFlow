from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Literal


class OrderItemCreate(BaseModel):
    ticket_type_id: int
    quantity: int = Field(ge=1)


class OrderCreate(BaseModel):
    buyer_name: str = Field(min_length=1, max_length=200)
    items: list[OrderItemCreate] = Field(min_length=1)



class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_type_id: int
    quantity: int
    unit_price: int


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    ticket_type_id: int
    event_id: int
    attendee_name: str
    status: str
    created_at: datetime
    checked_in_at: datetime | None


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    status: str
    total_amount: int
    buyer_name: str
    buyer_email: str
    created_at: datetime
    # pending orders must be paid before this moment, or their tickets go back on sale
    expires_at: datetime | None
    paid_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    items: list[OrderItemResponse]
    tickets: list[TicketResponse]


class AttendeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticket_id: int
    attendee_name: str
    ticket_type_name: str
    status: str
    order_id: int
    buyer_email: str
    created_at: datetime


class PayOrderRequest(BaseModel):
    # simulation only: lets the demo show both a successful and a declined payment
    simulate_outcome: Literal["success", "failure"] = "success"


class TicketTypeSales(BaseModel):
    ticket_type_id: int
    name: str
    price: int
    quantity: int
    sold: int
    reserved: int
    available: int


class SalesSummaryResponse(BaseModel):
    event_id: int
    currency: str
    is_simulated: bool
    gross_sales: int
    processing_fees: int
    refunds: int
    estimated_payout: int
    paid_orders: int
    ticket_types: list[TicketTypeSales]


class CancelOrderRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RefundOrderRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
