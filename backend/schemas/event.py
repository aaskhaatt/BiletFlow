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


class EventPage(BaseModel):
    # one page of GET /events; total counts every matching event, not just this page
    items: list[EventResponse]
    total: int
