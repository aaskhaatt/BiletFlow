from schemas.user import UserCreate, UserLogin
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from repositories.user_repository import create_user, get_user_by_email
from exceptions import UserAlreadyExistsError, UserNotFoundError, InvalidCredentialsError, InvalidRefreshTokenError
from repositories.refresh_token_repository import create_refresh_token, consume_refresh_token
from security import hash_password, verify_password, create_access_token, generate_refresh_token, hash_refresh_token, REFRESH_TOKEN_EXPIRE_DAYS




def register_user_service(user: UserCreate, db: Session):
    try:
        get_user_by_email(user.email, db)

    except UserNotFoundError:
        password_hash = hash_password(user.password)
        return create_user(user.email, password_hash, db)


    raise UserAlreadyExistsError()



def authenticate_user_service(user: UserLogin, db: Session):
    try:
        authenticated_user = get_user_by_email(user.email, db)

    except UserNotFoundError:
        raise InvalidCredentialsError()
    

    if not verify_password(user.password, authenticated_user.password_hash):
        raise InvalidCredentialsError()

        
    return authenticated_user
    

def issue_tokens(user_id: int, db: Session):
    refresh_token_value = generate_refresh_token()
    refresh_token_expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    # the database stores only the hash; the client gets the plain value
    create_refresh_token(user_id, hash_refresh_token(refresh_token_value), refresh_token_expires, db)

    access_token = create_access_token(user_id)

    return {"access_token": access_token, "refresh_token": refresh_token_value, "token_type": "bearer"}


def login_user_service(user: UserLogin, db: Session):
    authenticated_user = authenticate_user_service(user, db)

    tokens = issue_tokens(authenticated_user.id, db)
    db.commit()

    return tokens


def refresh_access_token_service(token_value: str, db: Session):
    # deletes the token in the same statement that finds it, so it can be used only once
    old_refresh_token = consume_refresh_token(hash_refresh_token(token_value), db)

    if old_refresh_token is None:
        raise InvalidRefreshTokenError()

    if old_refresh_token.expires_at < datetime.now(timezone.utc):
        # commit so the expired token stays deleted; get_db would otherwise roll it back
        db.commit()
        raise InvalidRefreshTokenError()

    tokens = issue_tokens(old_refresh_token.user_id, db)
    db.commit()

    return tokens


def logout_service(token_value: str, db: Session):
    # an unknown or already used token still counts as logged out
    consume_refresh_token(hash_refresh_token(token_value), db)
    db.commit()

    return {"message": "Successfully logged out"}