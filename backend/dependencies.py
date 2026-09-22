from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from security import decode_access_token
from exceptions import UserNotFoundError
from repositories.user_repository import get_user_by_id
from models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")



def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(status_code = 401, detail = "Invalid token")
    
    user_id = payload.get("sub")

    if user_id is None:
        raise HTTPException(status_code = 401, detail = "Invalid token")

    try: 
        user = get_user_by_id(user_id, db)

    except UserNotFoundError:
        raise HTTPException(status_code=404, detail = "User Not Found")

    return user





def require_platform_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    return current_user