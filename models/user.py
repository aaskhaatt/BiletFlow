from database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(nullable=False, default=False)

    organizer_profile: Mapped["OrganizerProfile | None"] = relationship("OrganizerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")