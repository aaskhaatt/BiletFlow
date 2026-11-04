from database import Base
from sqlalchemy.orm import Mapped, mapped_column


class PlatformSetting(Base):
    # simple key/value store for values a platform admin can change, e.g. "activation_fee_kzt"
    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str] = mapped_column(nullable=False)
