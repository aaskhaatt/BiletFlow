from datetime import datetime
from typing import Annotated
from pydantic import AfterValidator, BaseModel, EmailStr, ConfigDict, Field
from schemas.organizer import OrganizerResponse


# Ann@X.com and ann@x.com are one account: emails are saved and compared in lowercase
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda email: email.lower())]


class UserCreate(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=1)


class CurrentUserResponse(BaseModel):
    # everything the web and mobile apps need to decide which screens to show after login
    id: int
    email: EmailStr
    is_platform_admin: bool
    # opened the verification link (or reset the password through email); not required to order yet
    email_verified: bool
    # null if the user never applied; status "pending" or "approved" otherwise
    organizer: OrganizerResponse | None
    # assigned as check-in staff to at least one non-draft event (organizers can always scan their own events)
    is_event_staff: bool


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    email: EmailStr
    email_verified_at: datetime | None = None


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: NormalizedEmail


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=6)
    


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)
