from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

MetricId = Literal["pm25", "temperature_c", "humidity_percent"]
QualityStatus = Literal["valid", "suspicious", "quarantined", "estimated"]


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: str
    reading_id: str
    metric: MetricId
    value: float
    unit: str
    event_time: datetime
    received_at: datetime
    quality_status: QualityStatus
    quality_reason: str | None


class MeasurementPage(BaseModel):
    items: list[MeasurementOut]
    next_cursor: str | None


class AggregateOut(BaseModel):
    device_id: str | None
    metric: MetricId
    bucket_start: datetime
    min: float
    max: float
    avg: float
    count: int


class LatencyOut(BaseModel):
    p50: float
    p95: float
    p99: float


class SystemHealthOut(BaseModel):
    status: Literal["ok", "degraded", "down"]
    generated_at: datetime
    queue_depth: int
    ingest_rate_per_s: float
    latency_ms: LatencyOut
    error_rate: float
    db_writes_per_s: float
    valid_rate_24h: float | None