from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Table, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


# which ticket types a campaign applies to; a campaign with no rows here applies to every paid ticket type
promo_campaign_ticket_types = Table(
    "promo_campaign_ticket_types",
    Base.metadata,
    Column("campaign_id", ForeignKey("promo_campaigns.id", ondelete="CASCADE"), primary_key=True),
    Column("ticket_type_id", ForeignKey("ticket_types.id", ondelete="CASCADE"), primary_key=True),
)


class PromoCampaign(Base):
    """A promo code for one event (SRS 4.14). Attendees type the code at checkout to get the discount."""
    __tablename__ = "promo_campaigns"
    # the same code can exist at two different events, never twice at one
    __table_args__ = (UniqueConstraint("event_id", "code", name="uq_promo_campaigns_event_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(nullable=False)
    # stored in capitals; what attendees type is uppercased before comparing, so "summer20" works too
    code: Mapped[str] = mapped_column(nullable=False)
    # "percent": discount_value is 1-100 (% off); "fixed": discount_value is KZT off the order
    discount_type: Mapped[str] = mapped_column(nullable=False)
    discount_value: Mapped[int] = mapped_column(nullable=False)
    # optional validity window
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # null = unlimited
    max_redemptions: Mapped[int | None] = mapped_column(nullable=True)
    # orders currently using the code (pending or paid); changed only by the atomic redeem/release queries
    redemptions_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    # the organizer can switch a code off without deleting its history
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket_types: Mapped[list["TicketType"]] = relationship("TicketType", secondary=promo_campaign_ticket_types)

    @property
    def ticket_type_ids(self) -> list[int]:
        return sorted(ticket_type.id for ticket_type in self.ticket_types)
