from database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, ForeignKey, Numeric, false
from datetime import datetime

class TicketType(Base):
    __tablename__ = "ticket_types"


    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    price: Mapped[int] = mapped_column(nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    sales_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sales_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_hidden: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=false())

    event: Mapped["Event"] = relationship("Event", back_populates="ticket_types")