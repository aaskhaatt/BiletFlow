from database import Base
from sqlalchemy import ForeignKey, DateTime, func, true
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class PayoutAccount(Base):
    # where an organizer's ticket revenue would be paid out; simulated in the academic MVP
    __tablename__ = "payout_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("organizer_profiles.id", ondelete="CASCADE"), unique=True, nullable=False)
    holder_name: Mapped[str] = mapped_column(nullable=False)
    bank_name: Mapped[str] = mapped_column(nullable=False)
    # only the last 4 characters of the IBAN are stored: data we never keep can never leak
    iban_last4: Mapped[str] = mapped_column(nullable=False)
    is_simulated: Mapped[bool] = mapped_column(nullable=False, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
