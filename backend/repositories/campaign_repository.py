from datetime import datetime
from sqlalchemy import select, update, func, or_
from sqlalchemy.orm import Session, selectinload
from models import PromoCampaign, Order, OrderItem, TicketType
from exceptions import CampaignNotFoundError, PromoCodeNotFoundError


def create_campaign(event_id: int, name: str, code: str, discount_type: str, discount_value: int,
                    starts_at: datetime | None, ends_at: datetime | None, max_redemptions: int | None,
                    ticket_types: list[TicketType], db: Session) -> PromoCampaign:
    campaign = PromoCampaign(
        event_id=event_id,
        name=name,
        code=code,
        discount_type=discount_type,
        discount_value=discount_value,
        starts_at=starts_at,
        ends_at=ends_at,
        max_redemptions=max_redemptions,
        ticket_types=ticket_types,
    )

    db.add(campaign)
    # raises IntegrityError here if the code already exists at this event; the service turns it into a 409
    db.flush()

    return campaign


def get_campaign_by_id(campaign_id: int, db: Session) -> PromoCampaign:
    campaign = db.get(PromoCampaign, campaign_id)

    if campaign is None:
        raise CampaignNotFoundError()

    return campaign


def lock_campaign(campaign_id: int, db: Session) -> PromoCampaign:
    # for edits that compare with redemptions_count (e.g. lowering the limit), so a checkout can't slip in between
    stmt = (select(PromoCampaign).where(PromoCampaign.id == campaign_id)
            .with_for_update().execution_options(populate_existing=True))
    campaign = db.scalars(stmt).first()

    if campaign is None:
        raise CampaignNotFoundError()

    return campaign


def get_campaign_by_code(event_id: int, code: str, db: Session) -> PromoCampaign:
    stmt = select(PromoCampaign).where(PromoCampaign.event_id == event_id, PromoCampaign.code == code.strip().upper())
    campaign = db.scalars(stmt).first()

    if campaign is None:
        raise PromoCodeNotFoundError()

    return campaign


def get_campaigns_by_event_id(event_id: int, db: Session) -> list[PromoCampaign]:
    stmt = (select(PromoCampaign).where(PromoCampaign.event_id == event_id)
            .options(selectinload(PromoCampaign.ticket_types)).order_by(PromoCampaign.id))

    return list(db.scalars(stmt))


def update_campaign(campaign: PromoCampaign, changes: dict, db: Session) -> PromoCampaign:
    for field, value in changes.items():
        setattr(campaign, field, value)

    db.flush()

    return campaign


def redeem_campaign(campaign_id: int, now: datetime, db: Session) -> int | None:
    # ONE statement checks every rule AND takes a redemption, like reserve_ticket_type_inventory:
    # two buyers can never both take the last use of a limited code. None = refused.
    stmt = (
        update(PromoCampaign)
        .where(PromoCampaign.id == campaign_id,
               PromoCampaign.is_active.is_(True),
               or_(PromoCampaign.starts_at.is_(None), PromoCampaign.starts_at <= now),
               or_(PromoCampaign.ends_at.is_(None), PromoCampaign.ends_at > now),
               or_(PromoCampaign.max_redemptions.is_(None), PromoCampaign.redemptions_count < PromoCampaign.max_redemptions))
        .values(redemptions_count=PromoCampaign.redemptions_count + 1)
        .returning(PromoCampaign.redemptions_count)
    )

    return db.execute(stmt).scalar()


def release_campaign_redemption(campaign_id: int, db: Session):
    # gives a use back when its order expires, is cancelled or refunded; never goes below zero
    stmt = (
        update(PromoCampaign)
        .where(PromoCampaign.id == campaign_id, PromoCampaign.redemptions_count >= 1)
        .values(redemptions_count=PromoCampaign.redemptions_count - 1)
    )
    db.execute(stmt)


def get_campaign_stats(event_id: int, db: Session) -> dict[int, dict]:
    """Per campaign of the event: paid orders, tickets, gross, discount and net. One query for all of them."""
    # tickets per order, summed first: joining items straight to orders would count each order's total once per item
    quantities = (select(OrderItem.order_id, func.sum(OrderItem.quantity).label("tickets"))
                  .group_by(OrderItem.order_id).subquery())
    paid = Order.status == "confirmed"
    stmt = (
        select(
            PromoCampaign.id,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(quantities.c.tickets), 0).label("tickets"),
            func.coalesce(func.sum(Order.total_amount + Order.discount_amount), 0).label("gross"),
            func.coalesce(func.sum(Order.discount_amount), 0).label("discount"),
            func.coalesce(func.sum(Order.total_amount), 0).label("net"),
        )
        .select_from(PromoCampaign)
        # LEFT JOIN with the status in the ON clause: campaigns without paid orders still get a row of zeros
        .outerjoin(Order, (Order.campaign_id == PromoCampaign.id) & paid)
        .outerjoin(quantities, quantities.c.order_id == Order.id)
        .where(PromoCampaign.event_id == event_id)
        .group_by(PromoCampaign.id)
    )

    return {row.id: {"orders": row.orders, "tickets": row.tickets, "gross": row.gross,
                     "discount": row.discount, "net": row.net} for row in db.execute(stmt)}
