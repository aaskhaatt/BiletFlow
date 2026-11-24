from pydantic import BaseModel, EmailStr, ConfigDict, Field
from schemas.organizer import OrganizerResponse


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class CurrentUserResponse(BaseModel):
    # everything the web and mobile apps need to decide which screens to show after login
    id: int
    email: EmailStr
    is_platform_admin: bool
    # null if the user never applied; status "pending" or "approved" otherwise
    organizer: OrganizerResponse | None
    # assigned as check-in staff to at least one non-draft event (organizers can always scan their own events)
    is_event_staff: bool


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    email: EmailStr
    