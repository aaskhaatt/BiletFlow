from pydantic import ConfigDict, BaseModel, EmailStr

class OrganizerResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    user_id: int
    status: str