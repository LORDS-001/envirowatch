import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        CheckConstraint(
            "quality_status IN ('valid', 'suspicious', 'quarantined', 'estimated')",
            name="ck_measurements_quality",
        ),
        Index("ix_measurements_device_metric_time", "device_id", "metric", "event_time"),
    )

    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), primary_key=True)
    reading_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    metric: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quality_status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")
    quality_reason: Mapped[str | None] = mapped_column(String(200))


class IngestionEvent(Base):
    __tablename__ = "ingestion_events"
    __table_args__ = (
        CheckConstraint(
            "outcome IN ('accepted', 'duplicate', 'late', 'quarantined', 'rejected')",
            name="ck_ingestion_outcome",
        ),
        Index("ix_ingestion_device_received", "device_id", "received_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    reading_id: Mapped[str | None] = mapped_column(String(128))
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)