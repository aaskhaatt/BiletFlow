from datetime import datetime
from pydantic import BaseModel


class HistoryEntry(BaseModel):
    id: int
    created_at: datetime
    action: str                 # e.g. "order.paid", "ticket_type.updated"
    type: str                   # the part before the dot: "order", "ticket_type", ...
    entity_type: str
    entity_id: int | None
    description: str
    # who did it; both null for automatic actions (an expired checkout) or a deleted account
    actor_user_id: int | None
    actor_email: str | None


class HistoryPage(BaseModel):
    items: list[HistoryEntry]
    total: int
