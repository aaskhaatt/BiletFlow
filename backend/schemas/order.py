from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


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
