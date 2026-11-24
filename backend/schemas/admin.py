from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SuspendRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_platform_admin: bool
    email_verified_at: datetime | None
    suspended_at: datetime | None
    suspension_reason: str | None
