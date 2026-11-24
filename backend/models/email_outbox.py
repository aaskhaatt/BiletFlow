from database import Base
from sqlalchemy import DateTime, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class EmailOutbox(Base):
    """An email waiting to be sent (SRS 4.10).

    Rows are added by queue_email() in the same transaction as the action that causes them,
    so a rolled-back action never sends an email. The background sender (send_due_emails in
    services/email_service.py) sends pending rows whose next_attempt_at has come.
    """
    __tablename__ = "email_outbox"
    # the sender will look for "pending, oldest first" all the time
    __table_args__ = (Index("ix_email_outbox_status_created_at", "status", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    to_email: Mapped[str] = mapped_column(nullable=False)
    # one of EMAIL_TEMPLATES in services/email_service.py
    template: Mapped[str] = mapped_column(nullable=False)
    # values the template fills in, e.g. {"order_id": 12, "event_title": "Jazz Night"}
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    # pending / sent / failed
    status: Mapped[str] = mapped_column(nullable=False, default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # the sender only picks rows whose time has come; pushed forward while sending and after a failure
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
