from database import Base
from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class EventReport(Base):
    """A user's report about an event, for platform admins to review (SRS 4.12)."""
    __tablename__ = "event_reports"
    # one report per user per event; the constraint is the guarantee under concurrency
    __table_args__ = (UniqueConstraint("event_id", "reporter_user_id", name="uq_event_reports_event_reporter"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # fraud / inappropriate / misleading / spam / other
    reason: Mapped[str] = mapped_column(nullable=False)
    details: Mapped[str | None] = mapped_column(nullable=True)
    # open / dismissed / actioned
    status: Mapped[str] = mapped_column(nullable=False, default="open", server_default="open", index=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
