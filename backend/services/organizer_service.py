from sqlalchemy.orm import Session
from datetime import datetime, timezone
from repositories.organizer_repository import (get_organizer_by_user_id, create_organizer_profile, update_organizer_status,
                                              update_organizer_identity, search_organizers)
from repositories.payout_repository import get_payout_account_by_organizer_id, save_payout_account
from services.audit_service import log_action
from exceptions import (OrganizerNotFoundError, OrganizerProfileAlreadyExistsError, OrganizerNotApprovedError,
                        InvalidOrganizerStatusError)



def apply_for_organizer_service(user_id: int, display_name: str | None, db: Session):
    try:
        organizer = get_organizer_by_user_id(user_id, db)

    except OrganizerNotFoundError:
        organizer = create_organizer_profile(user_id, db)
        organizer.display_name = display_name
        db.commit()
        db.refresh(organizer)

        return organizer

    # a rejected applicant may try again (after fixing what the reason said): back to pending for the admins
    if organizer.status != "rejected":
        raise OrganizerProfileAlreadyExistsError()

    update_organizer_status(organizer, "pending", db)
    organizer.rejection_reason = None
    if display_name is not None:
        organizer.display_name = display_name
    log_action(db, user_id, "organizer.reapplied", "organizer", organizer.id, f"User {user_id} applied again")
    db.commit()
    db.refresh(organizer)

    return organizer


def approve_organizer_service(admin_user_id: int, user_id: int, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    if organizer.status == "approved":
        return organizer
    
    update_organizer_status(organizer, "approved", db)
    organizer.rejection_reason = None
    log_action(db, admin_user_id, "organizer.approved", "organizer", organizer.id,
               f"Approved organizer for user {user_id}")
    db.commit()
    db.refresh(organizer)

    return organizer



def ensure_organizer_approved_service(user_id: int, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    if organizer.status == "approved":
        return organizer

    raise OrganizerNotApprovedError()


def _organizer_profile(organizer, db: Session):
    return {
        "id": organizer.id,
        "user_id": organizer.user_id,
        "status": organizer.status,
        "display_name": organizer.display_name,
        "rejection_reason": organizer.rejection_reason,
        "legal_name": organizer.legal_name,
        "contact_phone": organizer.contact_phone,
        "identity_verified_at": organizer.identity_verified_at,
        "payout_account": get_payout_account_by_organizer_id(organizer.id, db),
    }


def get_my_organizer_profile_service(user_id: int, db: Session):
    return _organizer_profile(get_organizer_by_user_id(user_id, db), db)


def verify_identity_service(user_id: int, legal_name: str, contact_phone: str, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    # SIMULATED: a real platform would call an identity-verification provider here (KYC is out of MVP scope)
    update_organizer_identity(organizer, legal_name, contact_phone, datetime.now(timezone.utc), db)
    log_action(db, user_id, "organizer.identity_verified", "organizer", organizer.id, f"Simulated identity check passed for {legal_name}")
    db.commit()
    db.refresh(organizer)

    return _organizer_profile(organizer, db)


def set_payout_account_service(user_id: int, holder_name: str, bank_name: str, iban: str, db: Session):
    organizer = ensure_organizer_approved_service(user_id, db)

    # only the last 4 characters leave this function; the full IBAN is never stored
    iban_last4 = iban[-4:]
    save_payout_account(organizer.id, holder_name, bank_name, iban_last4, db)
    log_action(db, user_id, "payout_account.updated", "organizer", organizer.id,
               f"Connected simulated payout account at {bank_name} ending in {iban_last4}")
    db.commit()
    db.refresh(organizer)

    return _organizer_profile(organizer, db)


def update_my_organizer_profile_service(user_id: int, data, db: Session):
    """The public name on event pages. Any applicant may set it, pending or approved."""
    organizer = get_organizer_by_user_id(user_id, db)
    changes = data.model_dump(exclude_unset=True)

    if "display_name" in changes and changes["display_name"] != organizer.display_name:
        old = organizer.display_name
        organizer.display_name = changes["display_name"]
        db.flush()
        log_action(db, user_id, "organizer.updated", "organizer", organizer.id,
                   f"Display name: {old or '(none)'} -> {organizer.display_name or '(none)'}")
        db.commit()
        db.refresh(organizer)

    return _organizer_profile(organizer, db)


def reject_organizer_service(admin_user_id: int, user_id: int, reason: str, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    # approved organizers have events and buyers: an admin suspends the account instead
    if organizer.status != "pending":
        raise InvalidOrganizerStatusError()

    update_organizer_status(organizer, "rejected", db)
    organizer.rejection_reason = reason
    log_action(db, admin_user_id, "organizer.rejected", "organizer", organizer.id,
               f"Rejected organizer application of user {user_id}: {reason}")
    db.commit()
    db.refresh(organizer)

    return organizer


def search_organizers_service(status: str | None, q: str | None, limit: int | None, offset: int, db: Session):
    rows, total = search_organizers(status, q, limit, offset, db)
    items = [{"id": o.id, "user_id": o.user_id, "email": email, "status": o.status, "display_name": o.display_name,
              "legal_name": o.legal_name, "contact_phone": o.contact_phone,
              "identity_verified_at": o.identity_verified_at, "rejection_reason": o.rejection_reason}
             for o, email in rows]
    return items, total
