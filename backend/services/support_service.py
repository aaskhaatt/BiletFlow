"""Support cases (SRS 4.13). Readers of a case: its requester and its handlers. Anyone else gets 404.

Handlers: the event's organizer for attendee cases; platform admins for every case. Only handlers
change the status or the assignee; the requester's reply reopens a waiting or resolved case.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from exceptions import (InvalidSupportAssigneeError, OrderNotFoundError, OrganizerNotFoundError,
                        SupportCaseAccessDeniedError, SupportCaseNotFoundError, TicketNotFoundError, UserNotFoundError)
from models import User
from repositories.order_repository import get_order_by_id
from repositories.organizer_repository import get_organizer_by_user_id
from repositories.support_repository import (add_support_message, create_support_case, get_event_owner_user_id,
                                             get_support_case_by_id, list_support_cases)
from repositories.ticket_repository import get_ticket_by_id
from repositories.user_repository import get_user_by_id
from schemas.support import SupportCaseCreate, SupportCaseResponse
from services.audit_service import log_action
from repositories.audit_repository import get_entity_history
from services.email_service import queue_email
from services.event_service import ensure_event_owner_service, get_public_event_page_service
from services.organizer_service import ensure_organizer_approved_service


def _is_handler(user: User, case, db: Session) -> bool:
    if user.is_platform_admin:
        return True
    return case.kind == "attendee" and get_event_owner_user_id(case.event_id, db) == user.id


def _readable_case(user: User, case_id: int, db: Session):
    case = get_support_case_by_id(case_id, db)
    if case.requester_user_id != user.id and not _is_handler(user, case, db):
        raise SupportCaseNotFoundError()
    return case


def _handled_case(user: User, case_id: int, db: Session):
    case = _readable_case(user, case_id, db)
    if not _is_handler(user, case, db):
        raise SupportCaseAccessDeniedError()
    return case


def _email(user_id: int, template: str, case, db: Session, **extra):
    queue_email(db, get_user_by_id(user_id, db).email, template, {"case_id": case.id, "subject": case.subject, **extra})


def _touch(case):
    case.updated_at = datetime.now(timezone.utc)


def _own_order(user: User, order_id: int, error, db: Session):
    order = get_order_by_id(order_id, db)
    # 404 instead of 403, like GET /orders/{id}
    if order.user_id != user.id:
        raise error()
    return order


def open_support_case_service(user: User, data: SupportCaseCreate, db: Session):
    context = {"event_id": data.event_id, "order_id": None, "ticket_id": None}
    if data.kind == "attendee":
        if data.ticket_id is not None:
            ticket = get_ticket_by_id(data.ticket_id, db)
            order = _own_order(user, ticket.order_id, TicketNotFoundError, db)
            context = {"event_id": ticket.event_id, "order_id": order.id, "ticket_id": ticket.id}
        elif data.order_id is not None:
            order = _own_order(user, data.order_id, OrderNotFoundError, db)
            context = {"event_id": order.event_id, "order_id": order.id, "ticket_id": None}
        else:
            # any event whose page people can open, including a cancelled one (refund questions)
            get_public_event_page_service(data.event_id, db)
    else:
        get_organizer_by_user_id(user.id, db)  # 404 for non-organizers
        if data.event_id is not None:
            ensure_event_owner_service(user.id, data.event_id, db)

    # shortcut: a new case emails nobody; handlers see it in GET /support/cases/inbox. Add an email if organizers miss cases.
    case = create_support_case({"kind": data.kind, "category": data.category, "subject": data.subject,
                                "requester_user_id": user.id, **context}, db)
    add_support_message(case.id, user.id, data.message, db)
    db.commit()
    db.refresh(case)
    return case


def _history_entry(row) -> dict:
    # descriptions are written by this file: 'Support case "<subject>": open -> resolved' and
    # '...: assigned to user 7' / '...: unassigned'. The subject may contain anything, so read from the end.
    change = row.description.rsplit(": ", 1)[-1]
    entry = {"created_at": row.created_at, "actor_user_id": row.actor_user_id}
    if row.action == "support_case.status_changed":
        old, _, new = change.partition(" -> ")
        return {**entry, "action": "status_changed", "from_status": old, "to_status": new}
    assignee = change.removeprefix("assigned to user ")
    return {**entry, "action": "assigned", "assigned_user_id": int(assignee) if assignee.isdigit() else None}


def get_support_case_service(user: User, case_id: int, db: Session):
    case = _readable_case(user, case_id, db)
    rows = get_entity_history("support_case", case.id, ["support_case.status_changed", "support_case.assigned"], db)

    return {**SupportCaseResponse.model_validate(case).model_dump(), "history": [_history_entry(r) for r in rows]}


def add_support_message_service(user: User, case_id: int, body: str, db: Session):
    case = _readable_case(user, case_id, db)
    message = add_support_message(case.id, user.id, body, db)
    _touch(case)

    if user.id == case.requester_user_id:
        if case.status in ("waiting_for_customer", "resolved"):
            case.status = "open"
        # an unassigned platform case has no single person to tell; admins see it in the inbox
        notify = case.assigned_user_id or (get_event_owner_user_id(case.event_id, db) if case.kind == "attendee" else None)
    else:
        notify = case.requester_user_id
    if notify is not None and notify != user.id:
        _email(notify, "support_message", case, db)

    db.commit()
    db.refresh(message)
    return message


def change_support_status_service(user: User, case_id: int, status: str, db: Session):
    case = _handled_case(user, case_id, db)
    if case.status == status:
        return case

    old = case.status
    case.status = status
    _touch(case)
    log_action(db, user.id, "support_case.status_changed", "support_case", case.id,
               f'Support case "{case.subject}": {old} -> {status}', event_id=case.event_id)
    _email(case.requester_user_id, "support_case_status_changed", case, db, status=status)
    db.commit()
    db.refresh(case)
    return case


def assign_support_case_service(user: User, case_id: int, assignee_id: int | None, db: Session):
    case = _handled_case(user, case_id, db)
    if assignee_id is not None:
        try:
            assignee = get_user_by_id(assignee_id, db)
        except UserNotFoundError:
            raise InvalidSupportAssigneeError()
        if not _is_handler(assignee, case, db):
            raise InvalidSupportAssigneeError()

    case.assigned_user_id = assignee_id
    _touch(case)
    change = f"assigned to user {assignee_id}" if assignee_id is not None else "unassigned"
    log_action(db, user.id, "support_case.assigned", "support_case", case.id,
               f'Support case "{case.subject}": {change}', event_id=case.event_id)
    if assignee_id is not None and assignee_id != user.id:
        _email(assignee_id, "support_case_assigned", case, db)
    db.commit()
    db.refresh(case)
    return case


def get_my_support_cases_service(user: User, db: Session):
    return list_support_cases(db, requester_user_id=user.id)


def get_support_inbox_service(user: User, kind: str | None, status: str | None, db: Session):
    if user.is_platform_admin:
        return list_support_cases(db, kind=kind, status=status)
    try:
        organizer = ensure_organizer_approved_service(user.id, db)
    except OrganizerNotFoundError:
        raise SupportCaseAccessDeniedError()
    return list_support_cases(db, organizer_id=organizer.id, kind=kind, status=status)
