from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from datetime import datetime
from typing import Literal


class OrderItemCreate(BaseModel):
    ticket_type_id: int
    quantity: int = Field(ge=1)
    # optional, one per ticket (SRS 4.6): printed on each ticket. Missing ones get the buyer's name.
    attendee_names: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]] | None = None

    @model_validator(mode="after")
    def not_more_names_than_tickets(self):
        if self.attendee_names and len(self.attendee_names) > self.quantity:
            raise ValueError("more attendee_names than tickets")
        return self


class OrderCreate(BaseModel):
    buyer_name: str = Field(min_length=1, max_length=200)
    items: list[OrderItemCreate] = Field(min_length=1)
    # optional; not case-sensitive
    promo_code: str | None = Field(default=None, max_length=32)



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


class OrderEventSummary(BaseModel):
    # enough to show an order or ticket without another request, even after the event is cancelled or suspended
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    start_time: datetime
    end_time: datetime
    venue_name: str | None
    venue_address: str | None
    status: str
    image_url: str | None
    cancelled_at: datetime | None


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    status: str
    # what the attendee pays, after any discount
    total_amount: int
    discount_amount: int
    promo_code: str | None
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
    event: OrderEventSummary


class AttendeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticket_id: int
    attendee_name: str
    ticket_type_name: str
    status: str
    order_id: int
    buyer_email: str
    created_at: datetime
    # when and by whom (staff email) the ticket was scanned in; null unless status is checked_in
    checked_in_at: datetime | None = None
    checked_in_by: str | None = None


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
    # tickets of this type that were refunded, and that were scanned in (SRS 4.3)
    refunded: int
    checked_in: int


class SalesSummaryResponse(BaseModel):
    event_id: int
    currency: str
    is_simulated: bool
    gross_sales: int
    processing_fees: int
    refunds: int
    # promo discounts on paid orders, already left out of gross_sales
    discounts: int
    estimated_payout: int
    paid_orders: int
    ticket_types: list[TicketTypeSales]


class CancelOrderRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RefundOrderRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class EventOrderRefund(BaseModel):
    amount: int
    reason: str | None
    provider_reference: str     # "SIM-R-..." (simulated)
    created_at: datetime


class EventOrderRow(BaseModel):
    id: int
    status: str
    buyer_name: str
    buyer_email: str
    created_at: datetime
    paid_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    total_amount: int           # what the buyer paid, after any discount
    discount_amount: int
    promo_code: str | None
    processing_fee: int
    tickets: int                # issued tickets (0 for a checkout that wasn't paid)
    payment_reference: str | None   # "SIM-..." of the successful payment; null for free or unpaid orders
    refund: EventOrderRefund | None
    is_simulated: bool          # every payment is a demonstration, never real money (SRS 4.6)


class EventOrderPage(BaseModel):
    items: list[EventOrderRow]
    total: int
