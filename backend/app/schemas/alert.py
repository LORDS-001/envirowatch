from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.measurement import MetricId

AlertStatus = Literal["pending", "active", "acknowledged", "resolved"]
Channel = Literal["email", "sms", "webhook"]


class NotificationAttemptOut(BaseModel):
    alert_id: str
    channel: Channel
    outcome: Literal["delivered", "failed", "pending", "not_configured"]
    attempted_at: datetime


class AlertOut(BaseModel):
    id: str
    kind: Literal["environment", "device"]
    metric: MetricId | None
    site_id: str | None
    device_id: str | None
    title: str
    status: AlertStatus
    threshold: float | None
    hysteresis: float | None
    value: float | None
    opened_at: datetime
    activated_at: datetime | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    corroborating_devices: int | None = None
    notifications: list[NotificationAttemptOut] = []


class AlertPage(BaseModel):
    items: list[AlertOut]
    next_cursor: str | None = None


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    metric: MetricId
    kind: Literal["threshold", "unusual_change"]
    threshold: float
    hysteresis: float
    consecutive_readings: int
    cooldown_min: int
    channels: list[Channel]
    enabled: bool


class AlertRulePatch(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    threshold: float | None = None
    hysteresis: float | None = Field(default=None, ge=0)
    consecutive_readings: int | None = Field(default=None, ge=1, le=60)
    cooldown_min: int | None = Field(default=None, ge=0, le=1440)
    channels: list[Channel] | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def non_null_changes(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Rule fields cannot be null; omit unchanged fields")
        return self


class AlertRulePage(BaseModel):
    items: list[AlertRuleOut]
    next_cursor: str | None = None
