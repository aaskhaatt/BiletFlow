from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Literal
from database import get_db
from dependencies import get_current_user
from models import User
from schemas.support import (SupportCaseDetail, SupportAssigneeUpdate, SupportCaseCreate, SupportCaseResponse, SupportCaseSummary,
                             SupportMessageCreate, SupportMessageResponse, SupportStatus, SupportStatusUpdate)
from services.support_service import (add_support_message_service, assign_support_case_service,
                                      change_support_status_service, get_my_support_cases_service,
                                      get_support_case_service, get_support_inbox_service, open_support_case_service)


router = APIRouter(prefix="/support/cases", tags=["support"])


@router.post("", response_model=SupportCaseResponse, status_code=201)
def open_support_case(data: SupportCaseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return open_support_case_service(current_user, data, db)


# /me and /inbox must stay above /{case_id}
@router.get("/me", response_model=list[SupportCaseSummary])
def get_my_support_cases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_my_support_cases_service(current_user, db)


@router.get("/inbox", response_model=list[SupportCaseSummary])
def get_support_inbox(kind: Literal["attendee", "platform"] | None = None, status: SupportStatus | None = None,
                      current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_support_inbox_service(current_user, kind, status, db)


# the thread comes with the case; clients poll this for new messages (no WebSockets, SRS 4.13)
@router.get("/{case_id}", response_model=SupportCaseDetail)
def get_support_case(case_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_support_case_service(current_user, case_id, db)


@router.post("/{case_id}/messages", response_model=SupportMessageResponse, status_code=201)
def add_support_message(case_id: int, data: SupportMessageCreate, current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    return add_support_message_service(current_user, case_id, data.body, db)


@router.patch("/{case_id}/status", response_model=SupportCaseResponse)
def change_support_status(case_id: int, data: SupportStatusUpdate, current_user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    return change_support_status_service(current_user, case_id, data.status, db)


@router.patch("/{case_id}/assignee", response_model=SupportCaseResponse)
def assign_support_case(case_id: int, data: SupportAssigneeUpdate, current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    return assign_support_case_service(current_user, case_id, data.user_id, db)
