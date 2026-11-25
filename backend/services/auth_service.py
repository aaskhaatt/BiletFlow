from schemas.user import UserCreate, UserLogin
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
from repositories.user_repository import create_user, get_user_by_email, get_user_by_id
from exceptions import CurrentPasswordIncorrectError, UserAlreadyExistsError, UserNotFoundError, InvalidCredentialsError, InvalidRefreshTokenError, InvalidAccountTokenError, EmailAlreadyVerifiedError, UserSuspendedError
from repositories.refresh_token_repository import create_refresh_token, consume_refresh_token, delete_user_refresh_tokens
from repositories.account_token_repository import create_account_token, consume_account_token, delete_account_tokens
from repositories.staff_repository import has_staff_assignments
from services.email_service import queue_email
from models.user import User
from security import hash_password, verify_password, create_access_token, generate_refresh_token, hash_refresh_token, REFRESH_TOKEN_EXPIRE_DAYS




def register_user_service(user: UserCreate, db: Session):
    try:
        get_user_by_email(user.email, db)

    except UserNotFoundError:
        password_hash = hash_password(user.password)
        try:
            new_user = create_user(user.email, password_hash, db)
        except IntegrityError:
            # someone registered the same address a moment ago; the unique index caught it
            db.rollback()
            raise UserAlreadyExistsError()
        _queue_link_email(new_user, "verify_email", VERIFY_EMAIL_LIFETIME, db)
        db.commit()
        db.refresh(new_user)

        return new_user


    raise UserAlreadyExistsError()



def authenticate_user_service(user: UserLogin, db: Session):
    try:
        authenticated_user = get_user_by_email(user.email, db)

    except UserNotFoundError:
        raise InvalidCredentialsError()
    

    if not verify_password(user.password, authenticated_user.password_hash):
        raise InvalidCredentialsError()

    # only after the password check, so the error doesn't tell strangers the account exists
    if authenticated_user.suspended_at is not None:
        raise UserSuspendedError()

        
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



def get_current_user_profile_service(user: User, db: Session):
    # one call after login tells the apps who this is and which roles they have
    return {
        "id": user.id,
        "email": user.email,
        "is_platform_admin": user.is_platform_admin,
        "email_verified": user.email_verified_at is not None,
        "organizer": user.organizer_profile,
        "is_event_staff": has_staff_assignments(user.id, db),
    }


# --- email verification and password reset (Feature 7) -----------------------------------------

VERIFY_EMAIL_LIFETIME = timedelta(hours=24)
PASSWORD_RESET_LIFETIME = timedelta(hours=1)


def _queue_link_email(user, purpose: str, lifetime: timedelta, db: Session):
    """Replaces the user's earlier links of this purpose with a new one and queues the email that carries it."""
    delete_account_tokens(user.id, purpose, db)
    # same generator and hash as refresh tokens: random, and only the SHA-256 hash is stored
    token = generate_refresh_token()
    expires_at = datetime.now(timezone.utc) + lifetime
    create_account_token(user.id, purpose, hash_refresh_token(token), expires_at, db)
    queue_email(db, user.email, purpose, {"token": token, "expires_at": expires_at.isoformat()})


def _consume_link(token: str, purpose: str, db: Session):
    link = consume_account_token(hash_refresh_token(token), purpose, db)
    if link is None:
        raise InvalidAccountTokenError()
    if link.expires_at < datetime.now(timezone.utc):
        db.commit()  # keep the expired token deleted
        raise InvalidAccountTokenError()
    return get_user_by_id(link.user_id, db)


def verify_email_service(token: str, db: Session):
    user = _consume_link(token, "verify_email", db)
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Email verified"}


def resend_verification_service(user, db: Session):
    # shortcut: no rate limit; each call replaces the previous link, add a cooldown if it gets abused
    if user.email_verified_at is not None:
        raise EmailAlreadyVerifiedError()
    _queue_link_email(user, "verify_email", VERIFY_EMAIL_LIFETIME, db)
    db.commit()
    return {"message": "Verification email sent"}


def forgot_password_service(email: str, db: Session):
    # the same answer whether or not the account exists, so nobody can probe which emails are registered
    try:
        user = get_user_by_email(email, db)
    except UserNotFoundError:
        pass
    else:
        _queue_link_email(user, "password_reset", PASSWORD_RESET_LIFETIME, db)
        db.commit()
    return {"message": "If an account with this email exists, a reset link is on its way"}


def reset_password_service(token: str, new_password: str, db: Session):
    user = _consume_link(token, "password_reset", db)
    user.password_hash = hash_password(new_password)
    # the link proved the user owns the address
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
    # whoever knew the old password is signed out everywhere
    delete_user_refresh_tokens(user.id, db)
    db.commit()
    return {"message": "Password changed; please sign in again"}


def change_password_service(user: User, current_password: str, new_password: str, db: Session):
    """Signed in, knows the current password. Every other session is signed out; this device gets new tokens
    (same shape as login) so it stays signed in."""
    if not verify_password(current_password, user.password_hash):
        raise CurrentPasswordIncorrectError()

    user.password_hash = hash_password(new_password)
    delete_user_refresh_tokens(user.id, db)
    tokens = issue_tokens(user.id, db)
    db.commit()

    return tokens
