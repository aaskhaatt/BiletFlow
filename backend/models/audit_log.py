from database import Base
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from sqlalchemy import func, ForeignKey, DateTime


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(nullable=False)
    entity_type: Mapped[str] = mapped_column(nullable=False)
    entity_id: Mapped[int | None] = mapped_column(nullable=True)
    description: Mapped[str] = mapped_column(nullable=False)