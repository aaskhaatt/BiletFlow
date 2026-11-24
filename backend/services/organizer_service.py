from sqlalchemy.orm import Session
from datetime import datetime, timezone
from repositories.organizer_repository import get_organizer_by_user_id, create_organizer_profile, update_organizer_status, update_organizer_identity
from repositories.payout_repository import get_payout_account_by_organizer_id, save_payout_account
from services.audit_service import log_action
from exceptions import OrganizerNotFoundError, OrganizerProfileAlreadyExistsError, OrganizerNotApprovedError



def apply_for_organizer_service(user_id: int, db: Session):
    try:
        get_organizer_by_user_id(user_id, db)

    except OrganizerNotFoundError:
        organizer = create_organizer_profile(user_id, db)
        db.commit()
        db.refresh(organizer)

        return organizer

    raise OrganizerProfileAlreadyExistsError()


def approve_organizer_service(admin_user_id: int, user_id: int, db: Session):
    organizer = get_organizer_by_user_id(user_id, db)

    if organizer.status == "approved":
        return organizer
    
    update_organizer_status(organizer, "approved", db)
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
