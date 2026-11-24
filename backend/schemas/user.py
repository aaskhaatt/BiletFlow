from typing import Annotated
from pydantic import AfterValidator, BaseModel, EmailStr, ConfigDict, Field


# Ann@X.com and ann@x.com are one account: emails are saved and compared in lowercase
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda email: email.lower())]


class UserCreate(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    email: EmailStr
    