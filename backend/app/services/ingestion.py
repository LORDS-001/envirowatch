import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Device, IngestionEvent, Measurement

UNITS = {"pm25": "µg/m³", "temperature_c": "°C", "humidity_percent": "%"}
RANGES = {"pm25": (0, 1000), "temperature_c": (-40, 60), "humidity_percent": (0, 100)}

MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(hours=24)
LATE_AFTER = timedelta(minutes=5)


@dataclass
class Result:
    outcome: str
    reason: str | None = None
    reading_id: str | None = None


def _parse_time(raw) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None  # we require an explicit timezone
    return parsed.astimezone(timezone.utc)


def _process(db: Session, device: Device, payload: dict, received_at: datetime) -> Result:
    reading_id = payload.get("reading_id")
    if not isinstance(reading_id, str) or not 1 <= len(reading_id) <= 128:
        return Result("rejected", "reading_id must be a string of 1-128 characters")
    if payload.get("device_id", device.id) != device.id:
        return Result("rejected", "device_id does not match the API key", reading_id)

    event_time = _parse_time(payload.get("timestamp"))
    if event_time is None:
        return Result("rejected", "timestamp must be ISO 8601 with a timezone", reading_id)

    measurements = payload.get("measurements")
    if not isinstance(measurements, dict) or not measurements:
        return Result("rejected", "measurements must be a non-empty object", reading_id)

    clock_problem = None
    if event_time - received_at > MAX_FUTURE:
        clock_problem = "clock error: timestamp is in the future"
    elif received_at - event_time > MAX_AGE:
        clock_problem = "clock error: timestamp is more than 24 h old"

    rows = []
    first_quarantine_reason = None
    for metric, value in measurements.items():
        if metric not in UNITS or metric not in device.metrics:
            return Result("rejected", f"metric '{metric}' is not supported by this device", reading_id)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return Result("rejected", f"value for '{metric}' must be a finite number", reading_id)

        status, reason = "valid", None
        low, high = RANGES[metric]
        if clock_problem:
            status, reason = "quarantined", clock_problem
        elif not low <= value <= high:
            status, reason = "quarantined", f"{metric} out of range ({low} to {high})"
        if status == "quarantined" and first_quarantine_reason is None:
            first_quarantine_reason = reason

        rows.append(
            {
                "device_id": device.id,
                "reading_id": reading_id,
                "metric": metric,
                "value": float(value),
                "unit": UNITS[metric],
                "event_time": event_time,
                "received_at": received_at,
                "quality_status": status,
                "quality_reason": reason,
            }
        )

    stmt = (
        insert(Measurement)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["device_id", "reading_id", "metric"])
        .returning(Measurement.metric)
    )
    if not db.execute(stmt).all():
        return Result("duplicate", "reading_id already stored", reading_id)

    if first_quarantine_reason:
        return Result("quarantined", first_quarantine_reason, reading_id)
    if received_at - event_time > LATE_AFTER:
        return Result("late", "arrived after the late threshold; event time preserved", reading_id)
    return Result("accepted", None, reading_id)


def process_reading(db: Session, device: Device, payload: dict, received_at: datetime) -> Result:
    result = _process(db, device, payload, received_at)
    db.add(
        IngestionEvent(
            device_id=device.id,
            reading_id=result.reading_id,
            outcome=result.outcome,
            reason=result.reason,
            received_at=received_at,
        )
    )
    device.last_seen_at = received_at
    db.commit()  # measurements, log row and last_seen_at succeed or fail together
    return result