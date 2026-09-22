from sqlalchemy.orm import Session
from repositories.organizer_repository import get_organizer_by_user_id, create_organizer_profile, update_organizer_status
from exceptions import OrganizerNotFoundError, OrganizerProfileAlreadyExistsError, OrganizerNotApprovedError



def apply_for_organizer_service(user_id: int, db: Session):
    try:
        get_organizer_by_user_id(user_id, db)

    except OrganizerNotFoundError:
        return create_organizer_profile(user_id, db)

    raise OrganizerProfileAlreadyExistsError()


def approve_organizer_service(user_id: int, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    if organizer.status == "approved":
        return organizer
    
    return update_organizer_status(organizer, "approved", db)



def ensure_organizer_approved_service(user_id: int, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    if organizer.status == "approved":
        return organizer

    raise OrganizerNotApprovedError()

