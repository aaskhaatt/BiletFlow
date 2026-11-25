from pydantic import BaseModel, ConfigDict, Field, model_validator
from schemas.partial import reject_nulls
from datetime import datetime
from typing import Literal


class EventCreate(BaseModel):
    
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime
    category: str | None = None
    venue_name: str | None = None
    venue_address: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    visibility: Literal["public", "unlisted", "private"] = "public"
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    refund_policy: str | None = Field(default=None, max_length=2000)


class EventUpdate(BaseModel):

    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    category: str | None = None
    venue_name: str | None = None
    venue_address: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    visibility: Literal["public", "unlisted", "private"] | None = None
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    refund_policy: str | None = Field(default=None, max_length=2000)

    # send only what changes; null clears an optional field (category, venue, capacity, dates, refund policy)
    @model_validator(mode="after")
    def required_fields_not_null(self):
        return reject_nulls(self, ("title", "start_time", "end_time", "visibility"))



class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int 
    organizer_id: int
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime
    status: str
    category: str | None = None
    venue_name: str | None = None
    venue_address: str | None = None
    capacity: int | None = None
    visibility: str
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    refund_policy: str | None = None
    # public address of the cover image, null when there is none
    image_url: str | None = None
    suspended_at: datetime | None = None
    suspension_reason: str | None = None
    # draft / upcoming / active (between start and end) / completed / cancelled, worked out on every read
    lifecycle: str
    # the name attendees see: the organizer's display name, else their verified legal name; null if neither is set
    organizer_name: str | None = None
    published_at: datetime | None = None
    cancelled_at: datetime | None = None


class EventListItem(EventResponse):
    # for catalogue cards, so the list needs no extra request per event
    min_price: int | None = None          # cheapest visible ticket type; null = no ticket types yet
    tickets_remaining: int | None = None  # left across visible types, capped by the event capacity; null = no ticket types


class EventPage(BaseModel):
    # one page of GET /events; total counts every matching event, not just this page
    items: list[EventListItem]
    total: int


class EventDuplicate(BaseModel):
    # both optional. start_time moves the whole copy: end time, registration window and ticket sales
    # shift by the same amount, so "same concert, one month later" needs only the new start.
    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_time: datetime | None = None


class OrganizerEventSummary(BaseModel):
    # one row of the organizer's home page: GET /events/me/summary
    event_id: int
    title: str
    status: str
    lifecycle: str
    start_time: datetime
    end_time: datetime
    image_url: str | None
    capacity: int | None
    tickets_sold: int             # valid tickets issued (used or not)
    revenue: int                  # what attendees paid on orders that stay paid, after discounts (KZT)
    paid_sales_status: str        # not_started | pending | active | suspended
