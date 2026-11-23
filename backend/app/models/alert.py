import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _alert_id() -> str:
    return f"alert-{uuid.uuid4().hex[:12]}"


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    metric: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(20), default="threshold")  # threshold | unusual_change
    threshold: Mapped[float] = mapped_column(Float)
    hysteresis: Mapped[float] = mapped_column(Float, default=0)
    consecutive_readings: Mapped[int] = mapped_column(Integer, default=3)
    cooldown_min: Mapped[int] = mapped_column(Integer, default=15)
    channels: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_org_status", "organization_id", "status"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_alert_id)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    rule_id: Mapped[str | None] = mapped_column(ForeignKey("alert_rules.id"))
    fingerprint: Mapped[str] = mapped_column(String(200), index=True)  # what the alert is about
    kind: Mapped[str] = mapped_column(String(20))  # environment | device
    metric: Mapped[str | None] = mapped_column(String(32))
    site_id: Mapped[str | None] = mapped_column(ForeignKey("sites.id"))
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"))
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20))  # pending | active | acknowledged | resolved
    threshold: Mapped[float | None] = mapped_column(Float)
    hysteresis: Mapped[float | None] = mapped_column(Float)
    value: Mapped[float | None] = mapped_column(Float)
    corroborating_devices: Mapped[int | None] = mapped_column(Integer)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationAttempt(Base):
    __tablename__ = "notification_attempts"
    __table_args__ = (Index("ix_notification_attempts_due", "outcome", "next_attempt_at", "id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    outcome: Mapped[str] = mapped_column(String(20))  # delivered | failed | pending
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    attempt_count: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
