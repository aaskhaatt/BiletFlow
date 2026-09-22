from fastapi import APIRouter, Depends
from schemas.user import UserCreate, UserResponse, UserLogin
from sqlalchemy.orm import Session
from database import get_db
from services.user_service import register_user_service, authenticate_user_service
from security import create_access_token


router = APIRouter(prefix="/auth", tags=["auth"])



@router.post("/register", status_code=201, response_model=UserResponse)
def user_registration(user: UserCreate, db: Session = Depends(get_db)):
    return register_user_service(user, db)


@router.post("/login")
def user_login(user: UserLogin, db: Session = Depends(get_db)):
    authenticated_user =  authenticate_user_service(user, db)

    token = create_access_token(authenticated_user.id)

    return {"access_token": token, "token_type": "bearer"}