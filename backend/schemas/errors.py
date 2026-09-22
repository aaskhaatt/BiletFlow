from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    message: str
    fields: dict[str, str] | None = None