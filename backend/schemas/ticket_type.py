from pydantic import BaseModel, ConfigDict, Field, model_validator
from schemas.partial import reject_nulls
from datetime import datetime


class TicketTypeCreate(BaseModel):
    name: str
    description: str | None = None
    price: int = Field(ge=0)
    quantity: int = Field(gt=0)
    sales_start: datetime
    sales_end: datetime
    max_per_order: int = Field(default=10, ge=1)



class TicketTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, gt=0)
    sales_start: datetime | None = None
    sales_end: datetime | None = None
    max_per_order: int | None = Field(default=None, ge=1)

    # send only what changes; null clears the description, every other field must keep a value
    @model_validator(mode="after")
    def required_fields_not_null(self):
        return reject_nulls(self, ("name", "price", "quantity", "sales_start", "sales_end", "max_per_order"))



class TicketTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    name: str
    description: str | None = None
    price: int
    quantity: int
    sales_start: datetime
    sales_end: datetime
    is_hidden: bool
    max_per_order: int
    sold_count: int
