from datetime import datetime
from typing import Literal

from pydantic import BaseModel

HealthStatus = Literal["online", "silent", "drifting", "suspicious", "deactivated"]
FaultType = Literal["silent", "drift", "spike", "clock_error", "duplicate", "late", "network"]


class DeviceHealthEventOut(BaseModel):
    device_id: str
    fault_type: FaultType
    severity: Literal["warn", "critical"]
    detected_at: datetime
    detail: str | None = None


class HealthSummaryItem(BaseModel):
    device_id: str
    site_id: str
    health: HealthStatus
    last_seen_at: datetime | None
    latest_event: DeviceHealthEventOut | None


class DeviceHealthOut(BaseModel):
    device_id: str
    health: HealthStatus
    last_seen_at: datetime | None
    events: list[DeviceHealthEventOut]


class IngestionEventOut(BaseModel):
    device_id: str
    reading_id: str
    outcome: Literal["accepted", "duplicate", "late", "quarantined", "rejected"]
    reason: str | None
    received_at: datetime


class IngestionEventPage(BaseModel):
    items: list[IngestionEventOut]
    next_cursor: str | None = None

class HealthSummaryPage(BaseModel):
    items: list[HealthSummaryItem]
    next_cursor: str | None = None
