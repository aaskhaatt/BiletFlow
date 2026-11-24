from database import Base
from sqlalchemy import ForeignKey, DateTime, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime


class Order(Base):
    __tablename__ = "orders"
    # the expiry sweeper looks for "pending AND expires_at < now" all the time
    __table_args__ = (Index("ix_orders_status_expires_at", "status", "expires_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    # pending / confirmed / cancelled / refunded / expired
    status: Mapped[str] = mapped_column(nullable=False)
    # what the attendee pays, in KZT
    total_amount: Mapped[int] = mapped_column(nullable=False)
    # the platform's processing charge, deducted from the organizer's payout (not added for the attendee)
    processing_fee: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    # paid orders hold their tickets until this moment; after it, the hold is released
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # snapshots: the order must not change when the user edits their profile later
    buyer_name: Mapped[str] = mapped_column(nullable=False)
    buyer_email: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # promo code used, if any. The code and the discount are snapshots like the prices: later campaign edits don't change them.
    # total_amount is already AFTER the discount; total_amount + discount_amount = the full ticket prices
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("promo_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    promo_code: Mapped[str | None] = mapped_column(nullable=True)
    discount_amount: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    tickets: Mapped[list["Ticket"]] = relationship("Ticket", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_type_id: Mapped[int] = mapped_column(ForeignKey("ticket_types.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    # snapshot of the price at purchase time; later price changes must not rewrite old orders
    unit_price: Mapped[int] = mapped_column(nullable=False)
    # one name per ticket, kept until the tickets are issued (at payment for paid orders); missing ones use the buyer's
    attendee_names: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    ticket_type: Mapped["TicketType"] = relationship("TicketType")
