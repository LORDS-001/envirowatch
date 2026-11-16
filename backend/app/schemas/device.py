import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MetricId = Literal["pm25", "temperature_c", "humidity_percent"]
DeviceStatus = Literal["active", "deactivated"]


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    type: str
    status: DeviceStatus
    last_seen_at: datetime | None
    metrics: list[MetricId]


class DeviceCreate(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,64}$")
    site_id: str
    type: str = Field(min_length=1, max_length=50)
    metrics: list[MetricId] = Field(min_length=1)


class DevicePatch(BaseModel):
    site_id: str| None = None
    type: str | None = Field(default=None, min_length=1, max_length=50)
    status: DeviceStatus | None = None
    metrics: list[MetricId] | None = Field(default=None, min_length=1)


class DeviceWithKey(BaseModel):
    device: DeviceOut
    api_key: str


class RotatedKey(BaseModel):
    device_id: str
    api_key: str
    rotated_at: datetime


class DevicePage(BaseModel):
    items: list[DeviceOut]
    next_cursor: str | None