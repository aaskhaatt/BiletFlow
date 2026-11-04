from database import Base
from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class PaidSalesActivation(Base):
    # one row per event that started the activation checklist (SRS 4.5)
    __tablename__ = "paid_sales_activations"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), unique=True, nullable=False)
    # "pending" -> "active" -> "suspended" (and back to "active" when an admin reinstates)
    status: Mapped[str] = mapped_column(nullable=False, default="pending", server_default="pending")
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # snapshot of the fee at payment time; the admin may change the platform fee later
    fee_amount: Mapped[int | None] = mapped_column(nullable=True)
    fee_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fee_payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
