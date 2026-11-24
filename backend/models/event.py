from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, ForeignKey
from database import Base
from datetime import datetime
from storage import public_url


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("organizer_profiles.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="draft")
    category: Mapped[str | None] = mapped_column(nullable=True)
    venue_name: Mapped[str | None] = mapped_column(nullable=True)
    venue_address: Mapped[str | None] = mapped_column(nullable=True)
    capacity: Mapped[int | None] = mapped_column(nullable=True)
    visibility: Mapped[str] = mapped_column(nullable=False, default="public", server_default="public")
    registration_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # tickets taken across all ticket types, checked against capacity by the atomic reserve query
    tickets_sold: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    # free text shown to attendees, e.g. "Full refund up to 7 days before the event" (SRS 4.9)
    refund_policy: Mapped[str | None] = mapped_column(nullable=True)
    # where the cover image lives in file storage, e.g. "events/12/3f9a....jpg"; the URL is built from it
    image_key: Mapped[str | None] = mapped_column(nullable=True)

    @property
    def image_url(self) -> str | None:
        # the full address clients load the image from; storing only the key means moving storage never needs a data migration
        return public_url(self.image_key)


    organizer: Mapped["OrganizerProfile"] = relationship("OrganizerProfile", back_populates="events")
    ticket_types: Mapped[list["TicketType"]] = relationship("TicketType", back_populates="event", cascade="all, delete-orphan")