from database import Base
from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class AccountToken(Base):
    """A one-use link token for email verification or password reset (SRS 4.1).

    Like refresh tokens, only the SHA-256 hash is stored, and using a token deletes it in the same
    statement that finds it (consume_account_token), so a link works exactly once.
    """
    __tablename__ = "account_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # verify_email / password_reset
    purpose: Mapped[str] = mapped_column(nullable=False)
    token_hash: Mapped[str] = mapped_column(unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
