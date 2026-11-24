from exceptions import UserNotFoundError
from models import User
from sqlalchemy import func, select
from sqlalchemy.orm import Session




def get_user_by_id(user_id: int, db: Session):
    user = db.get(User, user_id)

    if user is None:
        raise UserNotFoundError()

    return user



def get_user_by_email(email: str, db: Session):
    # case-insensitive, so callers that didn't lowercase (e.g. staff assignment) still find the user
    stmt = select(User).where(func.lower(User.email) == email.strip().lower())

    user = db.scalars(stmt).first()

    if user is None:
        raise UserNotFoundError()

    return user


def create_user(email: str, password_hash: str, db: Session):
    new_user = User(
        email = email,
        password_hash = password_hash
    )

    db.add(new_user)
    db.flush()

    return new_user
