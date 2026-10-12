from fastapi import APIRouter, Depends
from schemas.user import UserCreate, UserResponse, UserLogin
from schemas.token import RefreshTokenResponse, RefreshTokenRequest, LogoutResponse
from sqlalchemy.orm import Session
from database import get_db
from services.auth_service import register_user_service, login_user_service, refresh_access_token_service, logout_service



router = APIRouter(prefix="/auth", tags=["auth"])



@router.post("/register", status_code=201, response_model=UserResponse)
def user_registration(user: UserCreate, db: Session = Depends(get_db)):
    return register_user_service(user, db)


@router.post("/login", response_model=RefreshTokenResponse)
def user_login(user: UserLogin, db: Session = Depends(get_db)):
    return login_user_service(user, db)


@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh_token_router(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    return refresh_access_token_service(data.refresh_token, db)

@router.post("/logout", response_model=LogoutResponse)
def logout_router(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    return logout_service(data.refresh_token, db)