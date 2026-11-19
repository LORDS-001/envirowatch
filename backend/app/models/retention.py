import uuid

from sqlalchemy import ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RetentionSetting(Base):
    __tablename__ = "retention_settings"

    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    raw_days: Mapped[int] = mapped_column(Integer, default=30)
    hourly_days: Mapped[int] = mapped_column(Integer, default=365)
    daily_days: Mapped[int] = mapped_column(Integer, default=1825)
    ingestion_events_days: Mapped[int] = mapped_column(Integer, default=30)