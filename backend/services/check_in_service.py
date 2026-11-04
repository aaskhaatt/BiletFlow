from sqlalchemy.orm import Session
from repositories.check_in_repository import (check_in_ticket, undo_check_in, create_check_in_record, get_ticket_details_by_code,
                                              get_ticket_details_by_id, search_tickets, get_ticket_status_counts)
from services.staff_service import ensure_can_scan_service
from services.audit_service import log_action
from exceptions import TicketNotCheckedInError

# campaign QR codes (Feature 9) and random QR codes don't start with this, so they can never admit anyone
ADMISSION_PREFIX = "T-"


def _result(result: str, message: str, ticket=None):
    return {"result": result, "message": message, "ticket": ticket}



def check_in_service(user_id: int, event_id: int, code: str, db: Session):
    event = ensure_can_scan_service(user_id, event_id, db)
    code = code.strip()

    if event.status == "cancelled":
        return _result("event_cancelled", "This event was cancelled")

    if not code.startswith(ADMISSION_PREFIX):
        return _result("invalid", "This is not an admission ticket")

    # act first, atomically; explain afterwards if it didn't work
    ticket_id = check_in_ticket(code, event.id, db)

    if ticket_id is not None:
        create_check_in_record(ticket_id, event.id, user_id, "check_in", db)
        ticket = get_ticket_details_by_id(ticket_id, db)
        log_action(db, user_id, "ticket.checked_in", "ticket", ticket_id,
                   f"Checked in {ticket.attendee_name} ({ticket.ticket_type_name})", event_id=event.id)
        db.commit()

        return _result("checked_in", "Ticket checked in", ticket)

    # nothing was checked in; these lookups only explain why, they change nothing
    ticket = get_ticket_details_by_code(code, db)

    if ticket is None:
        return _result("invalid", "Ticket not found")

    if ticket.event_id != event.id:
        # don't show details of another event's ticket
        return _result("wrong_event", "This ticket is for a different event")

    if ticket.status == "checked_in":
        return _result("already_checked_in", "This ticket was already used", ticket)

    if ticket.status == "refunded":
        return _result("refunded", "This ticket was refunded", ticket)

    return _result("cancelled", "This ticket was cancelled", ticket)



def undo_check_in_service(user_id: int, event_id: int, ticket_id: int, db: Session):
    event = ensure_can_scan_service(user_id, event_id, db)

    if undo_check_in(ticket_id, event.id, db) is None:
        raise TicketNotCheckedInError()

    create_check_in_record(ticket_id, event.id, user_id, "undo", db)
    ticket = get_ticket_details_by_id(ticket_id, db)
    log_action(db, user_id, "ticket.check_in_undone", "ticket", ticket_id,
               f"Undid check-in of {ticket.attendee_name} ({ticket.ticket_type_name})", event_id=event.id)
    db.commit()

    return ticket



def search_tickets_service(user_id: int, event_id: int, query: str, db: Session):
    event = ensure_can_scan_service(user_id, event_id, db)

    return search_tickets(event.id, query.strip(), db)



def check_in_stats_service(user_id: int, event_id: int, db: Session):
    event = ensure_can_scan_service(user_id, event_id, db)
    counts = get_ticket_status_counts(event.id, db)

    checked_in = counts.get("checked_in", 0)
    not_checked_in = counts.get("valid", 0)

    return {
        "registered": checked_in + not_checked_in,
        "checked_in": checked_in,
        "not_checked_in": not_checked_in,
        "cancelled": counts.get("cancelled", 0),
        "refunded": counts.get("refunded", 0),
    }
