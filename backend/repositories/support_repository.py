from exceptions import SupportCaseNotFoundError
from models import Event, OrganizerProfile, SupportCase, SupportMessage
from sqlalchemy import select
from sqlalchemy.orm import Session


def create_support_case(fields: dict, db: Session) -> SupportCase:
    case = SupportCase(**fields)
    db.add(case)
    db.flush()
    return case


def add_support_message(case_id: int, author_user_id: int, body: str, db: Session) -> SupportMessage:
    message = SupportMessage(case_id=case_id, author_user_id=author_user_id, body=body)
    db.add(message)
    db.flush()
    return message


def get_support_case_by_id(case_id: int, db: Session) -> SupportCase:
    case = db.get(SupportCase, case_id)
    if case is None:
        raise SupportCaseNotFoundError()
    return case


def get_event_owner_user_id(event_id: int, db: Session) -> int:
    return db.scalar(select(OrganizerProfile.user_id).join(Event, Event.organizer_id == OrganizerProfile.id)
                     .where(Event.id == event_id))


def list_support_cases(db: Session, requester_user_id: int | None = None, organizer_id: int | None = None,
                       kind: str | None = None, status: str | None = None) -> list[SupportCase]:
    stmt = select(SupportCase).order_by(SupportCase.updated_at.desc(), SupportCase.id.desc())
    if requester_user_id is not None:
        stmt = stmt.where(SupportCase.requester_user_id == requester_user_id)
    if organizer_id is not None:
        # attendee cases about this organizer's events
        stmt = stmt.join(Event, Event.id == SupportCase.event_id).where(
            Event.organizer_id == organizer_id, SupportCase.kind == "attendee")
    if kind is not None:
        stmt = stmt.where(SupportCase.kind == kind)
    if status is not None:
        stmt = stmt.where(SupportCase.status == status)
    return list(db.scalars(stmt))
