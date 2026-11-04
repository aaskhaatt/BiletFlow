from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime


class StaffAssign(BaseModel):
    email: EmailStr


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str
    created_at: datetime
