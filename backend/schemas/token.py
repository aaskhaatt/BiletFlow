from pydantic import BaseModel


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class AccessTokenResponse(BaseModel):
    access_token:str
    token_type: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class LogoutResponse(BaseModel):
    message: str