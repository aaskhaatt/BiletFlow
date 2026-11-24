from database import Base
from datetime import datetime
from sqlalchemy import DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # always saved in lowercase (see NormalizedEmail in schemas/user.py)
    email: Mapped[str] = mapped_column(nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(nullable=False, default=False)
    # set when the user opens the verification link (or resets the password through email)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # set by a platform admin (SRS 4.12); null = not suspended
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[str | None] = mapped_column(nullable=True)

    organizer_profile: Mapped["OrganizerProfile | None"] = relationship("OrganizerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates = "user", cascade="all, delete-orphan")


# one account per address whatever the letter case; also makes get_user_by_email's lower() lookup fast.
# Declared after the class so lower() gets the column, not the string "email".
Index("ux_users_email_lower", func.lower(User.email), unique=True)
