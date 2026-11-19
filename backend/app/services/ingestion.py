import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import bindparam, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Device, IngestionEvent, Measurement

UNITS = {"pm25": "µg/m³", "temperature_c": "°C", "humidity_percent": "%"}
RANGES = {"pm25": (0, 1000), "temperature_c": (-40, 60), "humidity_percent": (0, 100)}

MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(hours=24)
LATE_AFTER = timedelta(minutes=5)


@dataclass
class Item:
    device_id: str
    payload: dict
    received_at: datetime


@dataclass
class Prepared:
    device_id: str
    reading_id: str | None
    received_at: datetime
    outcome: str  # accepted | late | quarantined | rejected | duplicate
    reason: str | None = None
    rows: list[dict] = field(default_factory=list)


def _parse_time(raw) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def prepare(device: Device | None, item: Item) -> Prepared:
    payload, received_at = item.payload, item.received_at
    raw_id = payload.get("reading_id")
    rid = raw_id if isinstance(raw_id, str) and 1 <= len(raw_id) <= 128 else None

    def reject(reason: str) -> Prepared:
        return Prepared(item.device_id, rid, received_at, "rejected", reason)

    if device is None:
        return reject("unknown device")
    if device.status != "active":
        return reject("device is deactivated")
    if rid is None:
        return reject("reading_id must be a string of 1-128 characters")
    if payload.get("device_id", device.id) != device.id:
        return reject("device_id does not match the API key")

    event_time = _parse_time(payload.get("timestamp"))
    if event_time is None:
        return reject("timestamp must be ISO 8601 with a timezone")
    measurements = payload.get("measurements")
    if not isinstance(measurements, dict) or not measurements:
        return reject("measurements must be a non-empty object")

    clock_problem = None
    if event_time - received_at > MAX_FUTURE:
        clock_problem = "clock error: timestamp is in the future"
    elif received_at - event_time > MAX_AGE:
        clock_problem = "clock error: timestamp is more than 24 h old"

    rows, first_quarantine = [], None
    for metric, value in measurements.items():
        if metric not in UNITS or metric not in device.metrics:
            return reject(f"metric '{metric[:40]}' is not supported by this device")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return reject(f"value for '{metric}' must be a finite number")

        quality, reason = "valid", None
        low, high = RANGES[metric]
        if clock_problem:
            quality, reason = "quarantined", clock_problem
        elif not low <= value <= high:
            quality, reason = "quarantined", f"{metric} out of range ({low} to {high})"
        if quality == "quarantined" and first_quarantine is None:
            first_quarantine = reason

        rows.append({
            "device_id": device.id, "reading_id": rid, "metric": metric, "value": float(value),
            "unit": UNITS[metric], "event_time": event_time, "received_at": received_at,
            "quality_status": quality, "quality_reason": reason,
        })

    if first_quarantine:
        return Prepared(device.id, rid, received_at, "quarantined", first_quarantine, rows)
    if received_at - event_time > LATE_AFTER:
        return Prepared(device.id, rid, received_at, "late", "arrived after the late threshold; event time preserved", rows)
    return Prepared(device.id, rid, received_at, "accepted", None, rows)


def process_batch(db: Session, items: list[Item]) -> list[Prepared]:
    """One transaction for the whole batch: readings, ingestion log and last_seen_at."""
    devices = {
        d.id: d for d in db.scalars(select(Device).where(Device.id.in_({i.device_id for i in items})))
    }
    prepared = [prepare(devices.get(i.device_id), i) for i in items]

    # Duplicates inside this batch are caught here; duplicates of earlier batches by the database.
    seen: set[tuple[str, str]] = set()
    to_store: list[Prepared] = []
    for p in prepared:
        if p.outcome == "rejected":
            continue
        key = (p.device_id, p.reading_id)
        if key in seen:
            p.outcome, p.reason, p.rows = "duplicate", "reading_id already stored", []
            continue
        seen.add(key)
        to_store.append(p)

    rows = [r for p in to_store for r in p.rows]
    if rows:
        stmt = (
            insert(Measurement)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["device_id", "reading_id", "metric"])
            .returning(Measurement.device_id, Measurement.reading_id)
        )
        stored = {(d, r) for d, r in db.execute(stmt)}
        for p in to_store:
            if (p.device_id, p.reading_id) not in stored:
                p.outcome, p.reason = "duplicate", "reading_id already stored"

    last_seen: dict[str, datetime] = {}
    for p in prepared:
        if p.device_id in devices:
            last_seen[p.device_id] = max(p.received_at, last_seen.get(p.device_id, p.received_at))
            db.add(IngestionEvent(
                device_id=p.device_id, reading_id=p.reading_id, outcome=p.outcome,
                reason=p.reason[:300] if p.reason else None, received_at=p.received_at,
            ))

    if last_seen:
        t = Device.__table__
        db.connection().execute(
            update(t)
            .where(t.c.id == bindparam("b_id"), or_(t.c.last_seen_at.is_(None), t.c.last_seen_at < bindparam("b_ts")))
            .values(last_seen_at=bindparam("b_ts")),
            [{"b_id": k, "b_ts": v} for k, v in last_seen.items()],
        )

    db.commit()
    return prepared