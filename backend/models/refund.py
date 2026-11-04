from database import Base
from sqlalchemy import ForeignKey, DateTime, func, true
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class Refund(Base):
    # money returned for a paid order; full refunds only in the academic MVP (SRS 4.9)
    __tablename__ = "refunds"

    id: Mapped[int] = mapped_column(primary_key=True)
    # unique: an order can be refunded only once
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False)
    # the original payment the money goes back to
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(nullable=False, default="KZT", server_default="KZT")
    status: Mapped[str] = mapped_column(nullable=False, default="succeeded", server_default="succeeded")
    provider: Mapped[str] = mapped_column(nullable=False, default="simulated", server_default="simulated")
    is_simulated: Mapped[bool] = mapped_column(nullable=False, default=True, server_default=true())
    provider_reference: Mapped[str] = mapped_column(unique=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(nullable=True)
    initiated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
