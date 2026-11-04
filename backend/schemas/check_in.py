from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Literal


class CheckInRequest(BaseModel):
    # the text read from the QR code
    code: str = Field(min_length=1, max_length=200)


class UndoCheckInRequest(BaseModel):
    ticket_id: int


class CheckInTicket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    attendee_name: str
    ticket_type_name: str
    status: str
    checked_in_at: datetime | None


class CheckInResult(BaseModel):
    # always returned with 200: for the scanner, "invalid ticket" is a normal answer to show, not an error
    result: Literal["checked_in", "already_checked_in", "invalid", "wrong_event", "cancelled", "refunded", "event_cancelled"]
    message: str
    ticket: CheckInTicket | None


class CheckInStats(BaseModel):
    registered: int
    checked_in: int
    not_checked_in: int
    cancelled: int
    refunded: int
