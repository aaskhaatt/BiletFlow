from database import Base
from sqlalchemy import ForeignKey, DateTime, func, true
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class Payment(Base):
    # every money movement attempt, successful or not; reused by ticket checkout in Feature 5
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    # "activation_fee" now, "order" in Feature 5
    purpose: Mapped[str] = mapped_column(nullable=False)
    amount: Mapped[int] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(nullable=False, default="KZT", server_default="KZT")
    # "succeeded" / "failed"
    status: Mapped[str] = mapped_column(nullable=False)
    provider: Mapped[str] = mapped_column(nullable=False, default="simulated", server_default="simulated")
    # SRS 4.6: demonstration payments must never look like real ones
    is_simulated: Mapped[bool] = mapped_column(nullable=False, default=True, server_default=true())
    provider_reference: Mapped[str] = mapped_column(unique=True, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(nullable=True)
    payer_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
