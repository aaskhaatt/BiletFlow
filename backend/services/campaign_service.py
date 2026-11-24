"""Promo code campaigns (SRS 4.14): the organizer's side, plus the discount rules checkout uses."""
import os
import secrets
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from models import PromoCampaign, TicketType
from schemas.campaign import CampaignCreate, CampaignUpdate
from repositories.campaign_repository import (create_campaign, get_campaign_by_id, lock_campaign, get_campaign_by_code,
                                              get_campaigns_by_event_id, update_campaign, get_campaign_stats,
                                              get_campaign_by_token, count_link_open)
from repositories.ticket_type_repository import get_ticket_type_by_id
from services.audit_service import log_action
from services.event_service import ensure_event_owner_service, get_public_event_service
from security import generate_campaign_token
from qr import make_qr_png
from exceptions import (InvalidCampaignError, InvalidEventStatusError, PromoCodeAlreadyExistsError, PromoCodeNotActiveError,
                        PromoCodeUsedUpError, PromoCodeNotApplicableError, TicketTypeNotFoundError, EventNotFoundError,
                        CampaignLinkNotFoundError)

# no 0/O or 1/I/L, so a code read off a poster is typed correctly
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# the web app's address, the same setting the email links use; HTTPS once deployed
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def generate_promo_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def describe_discount(campaign: PromoCampaign) -> str:
    return f"{campaign.discount_value}%" if campaign.discount_type == "percent" else f"{campaign.discount_value} KZT"


# --- the discount rules, shared by checkout and its preview -------------------------------------------------------

def calculate_discount(campaign: PromoCampaign, requested: list[tuple[TicketType, int]]) -> int:
    """The discount for one order, in whole KZT. `requested` is [(ticket type, quantity), ...]."""
    allowed = set(campaign.ticket_type_ids)
    # only paid tickets, and only the campaign's ticket types if it names any
    eligible = sum(ticket_type.price * quantity for ticket_type, quantity in requested
                   if ticket_type.price > 0 and (not allowed or ticket_type.id in allowed))

    if eligible == 0:
        raise PromoCodeNotApplicableError()

    if campaign.discount_type == "percent":
        # rounded down: the organizer never loses a fraction of a tenge
        return eligible * campaign.discount_value // 100

    # a fixed discount can make the order free, never negative
    return min(campaign.discount_value, eligible)


def resolve_promo_code(event_id: int, code: str, requested: list[tuple[TicketType, int]], now: datetime,
                       db: Session) -> tuple[PromoCampaign, int]:
    """Finds the code and checks it for this order. These checks give clear errors early; the atomic
    redeem_campaign during checkout is what really guarantees the limit when buyers race."""
    campaign = get_campaign_by_code(event_id, code, db)
    ensure_usable(campaign, now)

    return campaign, calculate_discount(campaign, requested)


def ensure_usable(campaign: PromoCampaign, now: datetime):
    if (not campaign.is_active or (campaign.starts_at and now < campaign.starts_at)
            or (campaign.ends_at and now >= campaign.ends_at)):
        raise PromoCodeNotActiveError()

    if campaign.max_redemptions is not None and campaign.redemptions_count >= campaign.max_redemptions:
        raise PromoCodeUsedUpError()


# --- the organizer's side -----------------------------------------------------------------------------------------

def campaign_link(campaign: PromoCampaign) -> str:
    # what the Campaign QR contains: the event page with an opaque token, never the code or the discount
    return f"{FRONTEND_URL}/events/{campaign.event_id}?campaign={campaign.qr_token}"


def _response(campaign: PromoCampaign, stats: dict | None) -> dict:
    return {
        "id": campaign.id,
        "event_id": campaign.event_id,
        "name": campaign.name,
        "code": campaign.code,
        "discount_type": campaign.discount_type,
        "discount_value": campaign.discount_value,
        "starts_at": campaign.starts_at,
        "ends_at": campaign.ends_at,
        "max_redemptions": campaign.max_redemptions,
        "redemptions_count": campaign.redemptions_count,
        "is_active": campaign.is_active,
        "link": campaign_link(campaign),
        "link_opens": campaign.link_opens,
        "ticket_type_ids": campaign.ticket_type_ids,
        "created_at": campaign.created_at,
        "stats": stats or {"orders": 0, "tickets": 0, "gross": 0, "discount": 0, "net": 0},
    }


def create_campaign_service(user_id: int, event_id: int, data: CampaignCreate, db: Session) -> dict:
    event = ensure_event_owner_service(user_id, event_id, db)

    if event.status == "cancelled":
        raise InvalidEventStatusError()

    ticket_types = []
    for ticket_type_id in set(data.ticket_type_ids):
        try:
            ticket_type = get_ticket_type_by_id(ticket_type_id, db)
        except TicketTypeNotFoundError:
            raise InvalidCampaignError()
        # a code for another event's tickets, or for free tickets, could never give a discount
        if ticket_type.event_id != event.id or ticket_type.price == 0:
            raise InvalidCampaignError()
        ticket_types.append(ticket_type)

    # a chosen code that's taken is the organizer's mistake (409); a random one that's taken is just retried
    for attempt in range(5):
        code = data.code or generate_promo_code()
        try:
            # SAVEPOINT: a duplicate code undoes only this insert, not the whole transaction
            with db.begin_nested():
                campaign = create_campaign(event.id, data.name, code, data.discount_type, data.discount_value,
                                           data.starts_at, data.ends_at, data.max_redemptions, ticket_types,
                                           generate_campaign_token(), db)
            break
        except IntegrityError:
            if data.code:
                raise PromoCodeAlreadyExistsError()
    else:
        raise PromoCodeAlreadyExistsError()

    limit = f", up to {campaign.max_redemptions} uses" if campaign.max_redemptions else ""
    log_action(db, user_id, "campaign.created", "campaign", campaign.id,
               f'Created promo code {campaign.code} "{campaign.name}" ({describe_discount(campaign)} off{limit})',
               event_id=event.id)

    db.commit()
    db.refresh(campaign)

    return _response(campaign, None)


def get_event_campaigns_service(user_id: int, event_id: int, db: Session) -> list[dict]:
    event = ensure_event_owner_service(user_id, event_id, db)
    stats = get_campaign_stats(event.id, db)

    return [_response(campaign, stats.get(campaign.id)) for campaign in get_campaigns_by_event_id(event.id, db)]


def get_campaign_service(user_id: int, campaign_id: int, db: Session) -> dict:
    campaign = get_campaign_by_id(campaign_id, db)
    ensure_event_owner_service(user_id, campaign.event_id, db)

    return _response(campaign, get_campaign_stats(campaign.event_id, db).get(campaign.id))


def update_campaign_service(user_id: int, campaign_id: int, data: CampaignUpdate, db: Session) -> dict:
    campaign = get_campaign_by_id(campaign_id, db)
    ensure_event_owner_service(user_id, campaign.event_id, db)

    # only the fields that were sent; an explicit null clears a date or the limit
    changes = data.model_dump(exclude_unset=True)
    for field in ("name", "is_active"):
        if changes.get(field, "") is None:
            del changes[field]

    # locked, so a checkout can't take a use between our check and our write
    campaign = lock_campaign(campaign_id, db)

    starts_at = changes.get("starts_at", campaign.starts_at)
    ends_at = changes.get("ends_at", campaign.ends_at)
    if starts_at and ends_at and starts_at >= ends_at:
        raise InvalidCampaignError()

    # the limit can't go below the uses already taken
    max_redemptions = changes.get("max_redemptions", campaign.max_redemptions)
    if max_redemptions is not None and max_redemptions < campaign.redemptions_count:
        raise InvalidCampaignError()

    # "old -> new" for the audit log, collected before the update overwrites the old values
    described = [f"{field} {getattr(campaign, field)} -> {value}" for field, value in changes.items()
                 if getattr(campaign, field) != value]

    update_campaign(campaign, changes, db)

    if described:
        log_action(db, user_id, "campaign.updated", "campaign", campaign.id,
                   f"Updated promo code {campaign.code}: " + ", ".join(described), event_id=campaign.event_id)

    db.commit()
    db.refresh(campaign)

    return _response(campaign, get_campaign_stats(campaign.event_id, db).get(campaign.id))


# --- the Campaign QR ----------------------------------------------------------------------------------------------

def get_campaign_qr_service(user_id: int, campaign_id: int, db: Session) -> bytes:
    # a PNG for posters and flyers; organizer only, like the rest of the campaign
    campaign = get_campaign_by_id(campaign_id, db)
    ensure_event_owner_service(user_id, campaign.event_id, db)

    return make_qr_png(campaign_link(campaign))


def open_campaign_link_service(qr_token: str, db: Session) -> dict:
    """Called by the web or mobile app when someone opens a Campaign QR link: which event, and which code to pre-fill."""
    campaign = get_campaign_by_token(qr_token, db)

    # the same visibility rule as the public event page: drafts and private events stay hidden
    try:
        event = get_public_event_service(campaign.event_id, db)
    except EventNotFoundError:
        raise CampaignLinkNotFoundError()

    # a switched-off, ended or used-up code still opens the event page, just without the discount
    try:
        ensure_usable(campaign, datetime.now(timezone.utc))
        usable = True
    except (PromoCodeNotActiveError, PromoCodeUsedUpError):
        usable = False

    count_link_open(campaign.id, db)
    db.commit()

    return {
        "event_id": event.id,
        "promo_code": campaign.code if usable else None,
        "discount_type": campaign.discount_type if usable else None,
        "discount_value": campaign.discount_value if usable else None,
    }
