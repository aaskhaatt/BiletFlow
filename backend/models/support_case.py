from database import Base
from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime


class SupportCase(Base):
    """A support request with an async message thread (SRS 4.13).

    kind "attendee": opened from an event, order or ticket; handled by the event's organizer.
    kind "platform": opened by an organizer; handled by platform admins.
    Platform admins can read every case.
    """
    __tablename__ = "support_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[str] = mapped_column(nullable=False)
    subject: Mapped[str] = mapped_column(nullable=False)
    # open / in_progress / waiting_for_customer / resolved
    status: Mapped[str] = mapped_column(nullable=False, default="open", server_default="open", index=True)
    requester_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # context, filled in by the server from the most specific id the client sent
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=True, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True)
    assigned_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages: Mapped[list["SupportMessage"]] = relationship(
        "SupportMessage", back_populates="case", cascade="all, delete-orphan", order_by="SupportMessage.id")


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("support_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    # kept when the author's account is deleted, so the case history stays readable
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case: Mapped["SupportCase"] = relationship("SupportCase", back_populates="messages")
