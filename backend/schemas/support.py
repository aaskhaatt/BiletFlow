from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# SRS 4.13 issue categories
ATTENDEE_CATEGORIES = {"ticket_delivery", "payment", "refund", "seating", "event_information", "check_in",
                       "account", "technical"}
PLATFORM_CATEGORIES = {"account", "activation", "payment", "technical"}

SupportStatus = Literal["open", "in_progress", "waiting_for_customer", "resolved"]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class SupportCaseCreate(BaseModel):
    kind: Literal["attendee", "platform"]
    category: str
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    message: Text
    # attendee cases: exactly one of these, the most specific the page has; platform cases: event_id or nothing
    event_id: int | None = None
    order_id: int | None = None
    ticket_id: int | None = None

    @model_validator(mode="after")
    def check_kind(self):
        given = [name for name in ("event_id", "order_id", "ticket_id") if getattr(self, name) is not None]
        if self.kind == "attendee":
            if len(given) != 1:
                raise ValueError("send exactly one of event_id, order_id, ticket_id")
            if self.category not in ATTENDEE_CATEGORIES:
                raise ValueError(f"category must be one of {sorted(ATTENDEE_CATEGORIES)}")
        else:
            if given not in ([], ["event_id"]):
                raise ValueError("platform cases can only refer to an event")
            if self.category not in PLATFORM_CATEGORIES:
                raise ValueError(f"category must be one of {sorted(PLATFORM_CATEGORIES)}")
        return self


class SupportMessageCreate(BaseModel):
    body: Text


class SupportStatusUpdate(BaseModel):
    status: SupportStatus


class SupportAssigneeUpdate(BaseModel):
    # null unassigns
    user_id: int | None


class SupportMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_user_id: int | None
    body: str
    created_at: datetime


class SupportCaseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    category: str
    subject: str
    status: str
    requester_user_id: int
    event_id: int | None
    order_id: int | None
    ticket_id: int | None
    assigned_user_id: int | None
    created_at: datetime
    updated_at: datetime


class SupportCaseResponse(SupportCaseSummary):
    messages: list[SupportMessageResponse]


class SupportCaseHistoryEntry(BaseModel):
    # status changes and (un)assignments, oldest first; messages are in `messages`
    created_at: datetime
    action: Literal["status_changed", "assigned"]
    actor_user_id: int | None
    from_status: str | None = None          # status_changed only
    to_status: str | None = None
    assigned_user_id: int | None = None     # assigned only; null = unassigned


class SupportCaseDetail(SupportCaseResponse):
    history: list[SupportCaseHistoryEntry]
