from datetime import datetime
from sqlalchemy import select, update, func, or_, and_
from sqlalchemy.orm import Session, selectinload
from models import PromoCampaign, Order, OrderItem, TicketType, Event
from exceptions import CampaignNotFoundError, PromoCodeNotFoundError, CampaignLinkNotFoundError
from repositories.order_repository import sold_between


def create_campaign(event_id: int, name: str, code: str, discount_type: str, discount_value: int,
                    starts_at: datetime | None, ends_at: datetime | None, max_redemptions: int | None,
                    ticket_types: list[TicketType], qr_token: str, db: Session) -> PromoCampaign:
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
        qr_token=qr_token,
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


def get_campaign_stats(event_id: int, db: Session, sold_from: datetime | None = None,
                       sold_to: datetime | None = None) -> dict[int, dict]:
    """Per campaign of the event: paid orders, tickets, gross, discount and net. One query for all of them.
    With dates, only orders sold in that period count (analytics filters)."""
    # tickets per order, summed first: joining items straight to orders would count each order's total once per item
    quantities = (select(OrderItem.order_id, func.sum(OrderItem.quantity).label("tickets"))
                  .group_by(OrderItem.order_id).subquery())
    paid = and_(Order.status == "confirmed", *sold_between(sold_from, sold_to))
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


def get_campaign_by_token(qr_token: str, db: Session) -> PromoCampaign:
    campaign = db.scalars(select(PromoCampaign).where(PromoCampaign.qr_token == qr_token)).first()

    if campaign is None:
        raise CampaignLinkNotFoundError()

    return campaign


def count_link_open(campaign_id: int, db: Session):
    # +1 inside the database, so two people scanning at the same moment both count
    db.execute(update(PromoCampaign).where(PromoCampaign.id == campaign_id)
               .values(link_opens=PromoCampaign.link_opens + 1))


def search_campaigns(q: str | None, event_id: int | None, active: bool | None, limit: int | None, offset: int,
                     db: Session) -> tuple[list, int]:
    """Every campaign of every event, newest first, with its event title and paid-order stats. (page, total);
    limit=None returns every row (CSV export)."""
    quantities = (select(OrderItem.order_id, func.sum(OrderItem.quantity).label("tickets"))
                  .group_by(OrderItem.order_id).subquery())
    stats = (
        select(PromoCampaign.id.label("campaign_id"),
               func.count(Order.id).label("orders"),
               func.coalesce(func.sum(quantities.c.tickets), 0).label("tickets"),
               func.coalesce(func.sum(Order.total_amount + Order.discount_amount), 0).label("gross"),
               func.coalesce(func.sum(Order.discount_amount), 0).label("discount"),
               func.coalesce(func.sum(Order.total_amount), 0).label("net"))
        .select_from(PromoCampaign)
        .outerjoin(Order, (Order.campaign_id == PromoCampaign.id) & (Order.status == "confirmed"))
        .outerjoin(quantities, quantities.c.order_id == Order.id)
        .group_by(PromoCampaign.id)
        .subquery()
    )
    stmt = (select(PromoCampaign, Event.title.label("event_title"), stats)
            .join(Event, Event.id == PromoCampaign.event_id)
            .join(stats, stats.c.campaign_id == PromoCampaign.id))
    if event_id is not None:
        stmt = stmt.where(PromoCampaign.event_id == event_id)
    if active is not None:
        stmt = stmt.where(PromoCampaign.is_active.is_(active))
    if q:
        stmt = stmt.where(or_(PromoCampaign.code.icontains(q, autoescape=True),
                              PromoCampaign.name.icontains(q, autoescape=True),
                              Event.title.icontains(q, autoescape=True)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(PromoCampaign.id.desc()).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    return db.execute(stmt).all(), total
