from database import Base
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column , relationship




class OrganizerProfile(Base):
    __tablename__ = "organizer_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="pending")

    user: Mapped["User"] = relationship("User", back_populates = "organizer_profile")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="organizer", cascade="all, delete-orphan")