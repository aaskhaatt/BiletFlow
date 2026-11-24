from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse
from services.campaign_service import (create_campaign_service, get_event_campaigns_service, get_campaign_service,
                                       update_campaign_service)


# promo codes; all event organizer only
router = APIRouter(tags=["campaigns"])


@router.post("/events/{event_id}/campaigns", response_model=CampaignResponse, status_code=201)
def create_campaign(event_id: int, data: CampaignCreate, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return create_campaign_service(current_user.id, event_id, data, db)


@router.get("/events/{event_id}/campaigns", response_model=list[CampaignResponse])
def get_event_campaigns(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_event_campaigns_service(current_user.id, event_id, db)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_campaign_service(current_user.id, campaign_id, db)


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(campaign_id: int, data: CampaignUpdate, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return update_campaign_service(current_user.id, campaign_id, data, db)
