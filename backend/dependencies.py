from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends
from sqlalchemy.orm import Session
from database import get_db
from security import decode_access_token
from exceptions import (UserNotFoundError, UserSuspendedError, NotAuthenticatedError, InvalidTokenError,
                        PlatformAdminRequiredError)
from repositories.user_repository import get_user_by_id
from models.user import User

# auto_error=False: a missing token reaches get_current_user, which answers in the unified error format
# instead of FastAPI's {"detail": ...}
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)



def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        raise NotAuthenticatedError()

    payload = decode_access_token(token)

    # bad signature, expired, or not a JWT at all
    if payload is None:
        raise InvalidTokenError()

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise InvalidTokenError()

    try:
        user = get_user_by_id(user_id, db)

    except UserNotFoundError:
        # the account was deleted after the token was issued: the token is no longer valid (401, not 404)
        raise InvalidTokenError()

    # checked on every request, so a suspension takes effect at once, not when the token expires
    if user.suspended_at is not None:
        raise UserSuspendedError()

    return user





def require_platform_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_platform_admin:
        raise PlatformAdminRequiredError()

    return current_user
