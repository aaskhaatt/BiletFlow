from pydantic import BaseModel, ConfigDict
from datetime import datetime


class EventCreate(BaseModel):
    
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime


class EventUpdate(BaseModel):

    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None



class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int 
    organizer_id: int
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime
    status: str
