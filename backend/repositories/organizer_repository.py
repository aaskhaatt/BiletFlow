from sqlalchemy.orm import Session
from sqlalchemy import select
from models import OrganizerProfile
from exceptions import OrganizerNotFoundError


def get_organizer_by_user_id(user_id: int, db: Session):
    stmt = select(OrganizerProfile).where(OrganizerProfile.user_id == user_id)

    organizer = db.scalars(stmt).first()

    if organizer is None:
        raise OrganizerNotFoundError()

    return organizer


def create_organizer_profile(user_id: int, db: Session):
    new_organizer = OrganizerProfile(
        user_id = user_id
    )

    db.add(new_organizer)
    db.commit()
    db.refresh(new_organizer)

    return new_organizer


def update_organizer_status(organizer: OrganizerProfile, status: str, db: Session):

    organizer.status = status

    db.commit()
    db.refresh(organizer)
    return organizer