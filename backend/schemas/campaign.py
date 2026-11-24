from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # leave empty to get a random 8-character code; letters, digits and "-" only, stored in capitals
    code: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{3,32}$")
    discount_type: Literal["percent", "fixed"]
    # percent: 1-100; fixed: whole KZT off the order
    discount_value: int = Field(ge=1)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1)
    # empty = every paid ticket type of the event
    ticket_type_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("code")
    @classmethod
    def uppercase(cls, code: str | None) -> str | None:
        return code.upper() if code else code

    @model_validator(mode="after")
    def check(self):
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("a percent discount can be at most 100")
        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be before ends_at")
        return self


class CampaignUpdate(BaseModel):
    # the code, the discount and the ticket types are fixed once created: switch the campaign off and make a new one.
    # Send only what changes; sending null clears ends_at, starts_at or max_redemptions.
    name: str | None = Field(default=None, min_length=1, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class CampaignStats(BaseModel):
    # counted over paid (confirmed) orders that used the code
    orders: int
    tickets: int
    gross: int        # full ticket prices, before the discount
    discount: int     # total discount given
    net: int          # what attendees actually paid


class CampaignResponse(BaseModel):
    id: int
    event_id: int
    name: str
    code: str
    discount_type: str
    discount_value: int
    starts_at: datetime | None
    ends_at: datetime | None
    max_redemptions: int | None
    # orders holding the code right now: paid ones plus checkouts still being paid
    redemptions_count: int
    is_active: bool
    # what the Campaign QR (GET /campaigns/{id}/qr) contains, to share as a link too
    link: str
    # how many times that link was opened
    link_opens: int
    ticket_type_ids: list[int]
    created_at: datetime
    stats: CampaignStats


class CampaignLinkResponse(BaseModel):
    # where a Campaign QR leads. The promo fields are null when the code can't be used right now
    # (switched off, ended or used up): show the event without a discount
    event_id: int
    promo_code: str | None
    discount_type: str | None
    discount_value: int | None


class OrderPreviewItem(BaseModel):
    ticket_type_id: int
    quantity: int = Field(ge=1)


class OrderPreviewRequest(BaseModel):
    items: list[OrderPreviewItem] = Field(min_length=1)
    promo_code: str | None = Field(default=None, max_length=32)


class OrderPreviewResponse(BaseModel):
    # what the checkout screen shows before the order is placed; nothing is reserved
    subtotal: int
    discount: int
    total: int
    promo_code: str | None
