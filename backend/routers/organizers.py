from fastapi import APIRouter, Depends
from dependencies import get_current_user
from database import get_db
from models import User
from schemas.organizer import (OrganizerResponse, OrganizerProfileResponse, IdentityVerificationRequest, PayoutAccountRequest,
                              OrganizerApplyRequest, OrganizerUpdateRequest)
from sqlalchemy.orm import Session
from services.organizer_service import (apply_for_organizer_service, approve_organizer_service, get_my_organizer_profile_service,
                                        verify_identity_service, set_payout_account_service,
                                        update_my_organizer_profile_service)
from dependencies import require_platform_admin


router = APIRouter(prefix="/organizers", tags=["organizers"])


# the body is optional; a rejected applicant calls this again to go back to pending
@router.post("/apply", response_model=OrganizerResponse)
def apply_for_organizer(data: OrganizerApplyRequest | None = None, current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    return apply_for_organizer_service(current_user.id, data.display_name if data else None, db)


@router.patch("/{user_id}/approve", response_model=OrganizerResponse)
def approve_organizer(user_id: int, current_admin: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return approve_organizer_service(current_admin.id, user_id, db)
    


@router.get("/me", response_model=OrganizerProfileResponse)
def get_my_organizer_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_my_organizer_profile_service(current_user.id, db)


@router.patch("/me", response_model=OrganizerProfileResponse)
def update_my_organizer_profile(data: OrganizerUpdateRequest, current_user: User = Depends(get_current_user),
                                db: Session = Depends(get_db)):
    return update_my_organizer_profile_service(current_user.id, data, db)


@router.post("/me/verification", response_model=OrganizerProfileResponse)
def verify_identity(data: IdentityVerificationRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return verify_identity_service(current_user.id, data.legal_name, data.contact_phone, db)


@router.put("/me/payout-account", response_model=OrganizerProfileResponse)
def set_payout_account(data: PayoutAccountRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return set_payout_account_service(current_user.id, data.holder_name, data.bank_name, data.iban, db)
