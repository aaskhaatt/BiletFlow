from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from decimal import Decimal


class TicketTypeCreate(BaseModel):
    name: str
    description: str | None = None
    price: Decimal = Field(ge=0)
    quantity: int = Field(gt=0)
    sales_start: datetime
    sales_end: datetime



class TicketTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, gt=0)
    sales_start: datetime | None = None
    sales_end: datetime | None = None



class TicketTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    name: str
    description: str | None = None
    price: Decimal
    quantity: int
    sales_start: datetime
    sales_end: datetime
    is_hidden: bool