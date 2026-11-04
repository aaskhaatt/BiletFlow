from database import Base
from sqlalchemy import ForeignKey, DateTime
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column , relationship




class OrganizerProfile(Base):
    __tablename__ = "organizer_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="pending")
    legal_name: Mapped[str | None] = mapped_column(nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(nullable=True)
    # set by the simulated identity check; production KYC is out of the MVP scope
    identity_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates = "organizer_profile")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="organizer", cascade="all, delete-orphan")