from exceptions import UserNotFoundError
from models import User
from sqlalchemy import select
from sqlalchemy.orm import Session




def get_user_by_id(user_id: int, db: Session):
    user = db.get(User, user_id)

    if user is None:
        raise UserNotFoundError()

    return user



def get_user_by_email(email: str, db: Session):
    stmt = select(User).where(User.email == email)

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
    db.commit()
    db.refresh(new_user)

    return new_user
