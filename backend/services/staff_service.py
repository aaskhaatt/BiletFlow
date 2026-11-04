from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from repositories.user_repository import get_user_by_email
from repositories.event_repository import get_event_by_id
from repositories.organizer_repository import get_organizer_by_user_id
from repositories.staff_repository import (create_staff_assignment, get_staff_assignment, get_staff_by_event_id,
                                           delete_staff_assignment, get_events_for_staff)
from services.event_service import ensure_event_owner_service
from services.audit_service import log_action
from exceptions import StaffAlreadyAssignedError, StaffAssignmentNotFoundError, NotEventStaffError, OrganizerNotFoundError



def ensure_can_scan_service(user_id: int, event_id: int, db: Session):
    # assigned staff and the event's own organizer may scan; everyone else gets 403
    event = get_event_by_id(event_id, db)

    if get_staff_assignment(event_id, user_id, db) is not None:
        return event

    try:
        organizer = get_organizer_by_user_id(user_id, db)
    except OrganizerNotFoundError:
        raise NotEventStaffError()

    if organizer.id == event.organizer_id:
        return event

    raise NotEventStaffError()



def assign_staff_service(user_id: int, event_id: int, email: str, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)
    staff_user = get_user_by_email(email, db)

    # the friendly check; the unique constraint below is the real guarantee
    if get_staff_assignment(event.id, staff_user.id, db) is not None:
        raise StaffAlreadyAssignedError()

    try:
        assignment = create_staff_assignment(event.id, staff_user.id, db)
    except IntegrityError:
        # two requests assigned the same person at the same moment: the database rejected the second one
        db.rollback()
        raise StaffAlreadyAssignedError()

    log_action(db, user_id, "staff.assigned", "staff_assignment", assignment.id,
               f"Assigned {staff_user.email} as event staff", event_id=event.id)

    db.commit()
    db.refresh(assignment)

    return {"user_id": staff_user.id, "email": staff_user.email, "created_at": assignment.created_at}



def list_staff_service(user_id: int, event_id: int, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)

    return get_staff_by_event_id(event.id, db)



def remove_staff_service(user_id: int, event_id: int, staff_user_id: int, db: Session):
    event = ensure_event_owner_service(user_id, event_id, db)

    if not delete_staff_assignment(event.id, staff_user_id, db):
        raise StaffAssignmentNotFoundError()

    log_action(db, user_id, "staff.removed", "staff_assignment", None,
               f"Removed user #{staff_user_id} from event staff", event_id=event.id)

    db.commit()



def get_staff_events_service(user_id: int, db: Session):
    return get_events_for_staff(user_id, db)
