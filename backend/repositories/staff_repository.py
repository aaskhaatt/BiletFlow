from sqlalchemy.orm import Session
from sqlalchemy import select, delete, or_
from models import StaffAssignment, User, Event, OrganizerProfile



def create_staff_assignment(event_id: int, user_id: int, db: Session):
    assignment = StaffAssignment(event_id=event_id, user_id=user_id)

    db.add(assignment)
    db.flush()

    return assignment


def get_staff_assignment(event_id: int, user_id: int, db: Session) -> StaffAssignment | None:
    stmt = select(StaffAssignment).where(StaffAssignment.event_id == event_id, StaffAssignment.user_id == user_id)

    return db.scalars(stmt).first()


def get_staff_by_event_id(event_id: int, db: Session):
    stmt = (
        select(StaffAssignment.user_id, User.email, StaffAssignment.created_at)
        .join(User, StaffAssignment.user_id == User.id)
        .where(StaffAssignment.event_id == event_id)
        .order_by(StaffAssignment.created_at)
    )

    return db.execute(stmt).all()


def delete_staff_assignment(event_id: int, user_id: int, db: Session) -> bool:
    stmt = delete(StaffAssignment).where(StaffAssignment.event_id == event_id, StaffAssignment.user_id == user_id)

    # rowcount tells us whether anything was actually deleted
    return db.execute(stmt).rowcount > 0


def get_events_for_staff(user_id: int, db: Session):
    # events the user is assigned to as staff, plus events they organize themselves
    assigned = select(StaffAssignment.event_id).where(StaffAssignment.user_id == user_id)
    owned = (
        select(Event.id)
        .join(OrganizerProfile, Event.organizer_id == OrganizerProfile.id)
        .where(OrganizerProfile.user_id == user_id)
    )

    stmt = (
        select(Event)
        .where(or_(Event.id.in_(assigned), Event.id.in_(owned)), Event.status != "draft")
        .order_by(Event.start_time)
    )

    return db.scalars(stmt).all()
