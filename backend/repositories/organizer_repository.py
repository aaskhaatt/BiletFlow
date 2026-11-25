from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_
from models import OrganizerProfile, User
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
    db.flush()

    return new_organizer


def update_organizer_status(organizer: OrganizerProfile, status: str, db: Session):

    organizer.status = status

    db.flush()
    return organizer


def update_organizer_identity(organizer: OrganizerProfile, legal_name: str, contact_phone: str, verified_at, db: Session):
    organizer.legal_name = legal_name
    organizer.contact_phone = contact_phone
    organizer.identity_verified_at = verified_at

    db.flush()
    return organizer


def search_organizers(status: str | None, q: str | None, limit: int | None, offset: int, db: Session):
    """Organizer applications with the applicant's email, newest first. q matches email, names, or the id/user id."""
    stmt = select(OrganizerProfile, User.email).join(User, User.id == OrganizerProfile.user_id)
    if status is not None:
        stmt = stmt.where(OrganizerProfile.status == status)
    if q:
        conditions = [column.icontains(q, autoescape=True)
                      for column in (User.email, OrganizerProfile.legal_name, OrganizerProfile.display_name)]
        if q.isdigit():
            conditions += [OrganizerProfile.id == int(q), OrganizerProfile.user_id == int(q)]
        stmt = stmt.where(or_(*conditions))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(OrganizerProfile.id.desc()).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return db.execute(stmt).all(), total
