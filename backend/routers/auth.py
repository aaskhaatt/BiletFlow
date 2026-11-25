from fastapi import APIRouter, Depends
from schemas.user import (UserCreate, UserResponse, UserLogin, CurrentUserResponse, VerifyEmailRequest,
                          ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest)
from schemas.token import RefreshTokenResponse, RefreshTokenRequest, LogoutResponse
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models import User
from services.auth_service import (register_user_service, login_user_service, refresh_access_token_service, logout_service,
                                   get_current_user_profile_service, verify_email_service, resend_verification_service,
                                   forgot_password_service, reset_password_service, change_password_service)



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



@router.get("/me", response_model=CurrentUserResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_current_user_profile_service(current_user, db)


# responses are {"message": ...}, the same shape as logout
@router.post("/verify-email", response_model=LogoutResponse)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    return verify_email_service(data.token, db)


@router.post("/resend-verification", response_model=LogoutResponse)
def resend_verification(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return resend_verification_service(current_user, db)


@router.post("/forgot-password", response_model=LogoutResponse)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return forgot_password_service(data.email, db)


@router.post("/reset-password", response_model=LogoutResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    return reset_password_service(data.token, data.new_password, db)


# signed in: needs the current password; other devices are signed out, this one gets fresh tokens
@router.post("/change-password", response_model=RefreshTokenResponse)
def change_password(data: ChangePasswordRequest, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return change_password_service(current_user, data.current_password, data.new_password, db)
