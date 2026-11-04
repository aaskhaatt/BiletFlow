from database import Base
from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    # the value inside the QR code; random and unguessable, "T-" marks an admission ticket
    code: Mapped[str] = mapped_column(unique=True, nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False)
    ticket_type_id: Mapped[int] = mapped_column(ForeignKey("ticket_types.id", ondelete="CASCADE"), nullable=False)
    # duplicated from the order on purpose: check-in looks tickets up by event without a join
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    attendee_name: Mapped[str] = mapped_column(nullable=False)
    # valid / checked_in / cancelled / refunded
    status: Mapped[str] = mapped_column(nullable=False, default="valid", server_default="valid")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order: Mapped["Order"] = relationship("Order", back_populates="tickets")
    ticket_type: Mapped["TicketType"] = relationship("TicketType")
