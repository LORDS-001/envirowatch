import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from statistics import median

from sqlalchemy import bindparam, or_, select, update, func
from sqlalchemy.dialects.postgresql import insert, distinct_on
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


def process_batch(db: Session, items: list[Item], *, commit: bool = True) -> list[Prepared]:
    """One transaction for the whole batch: readings, ingestion log and last_seen_at."""
    devices = {
        d.id: d for d in db.scalars(select(Device).where(Device.id.in_({i.device_id for i in items})))
    }
    prepared = [prepare(devices.get(i.device_id), i) for i in items]
    _classify_spatial_outliers(db, devices, prepared)

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

    if commit:
        db.commit()
    else:
        db.flush()
    return prepared


def _classify_spatial_outliers(db: Session, devices: dict[str, Device], prepared: list[Prepared]) -> None:
    candidates = [row for item in prepared for row in item.rows if row["quality_status"] == "valid"]
    if not candidates:
        return
    reference = max(row["received_at"] for row in candidates)
    site_ids = {device.site_id for device in devices.values()}
    latest = db.execute(
        select(Device.site_id, Measurement.device_id, Measurement.metric, Measurement.value)
        .join(Measurement, Measurement.device_id == Device.id)
        .where(Device.site_id.in_(site_ids), Device.status == "active",
               Measurement.quality_status.in_(["valid", "estimated"]),
               Measurement.event_time >= reference - timedelta(minutes=10), Measurement.event_time <= reference)
        .ext(distinct_on(Measurement.device_id, Measurement.metric))
        .order_by(Measurement.device_id, Measurement.metric, Measurement.event_time.desc())
    ).all()
    peers = defaultdict(dict)
    for site_id, device_id, metric, value in latest:
        peers[(site_id, metric)][device_id] = value
    for row in candidates:
        if reference - timedelta(seconds=30) <= row["event_time"] <= reference:
            peers[(devices[row["device_id"]].site_id, row["metric"])][row["device_id"]] = row["value"]
    margins = {"pm25": 150, "temperature_c": 10, "humidity_percent": 35}
    recent_temperatures = defaultdict(list)
    if any(row["metric"] == "temperature_c" for row in candidates):
        recent = select(Measurement.device_id, Measurement.value,
                        func.row_number().over(partition_by=Measurement.device_id, order_by=Measurement.event_time.desc()).label("position"))\
            .where(Measurement.device_id.in_(list(devices)), Measurement.metric == "temperature_c",
                   Measurement.event_time >= reference - timedelta(minutes=5), Measurement.event_time <= reference,
                   Measurement.quality_status.in_(["valid", "suspicious", "estimated"])).subquery()
        for device_id, value in db.execute(select(recent.c.device_id, recent.c.value).where(recent.c.position <= 4)):
            recent_temperatures[device_id].append(value)
    for row in candidates:
        device = devices[row["device_id"]]
        values = [value for device_id, value in peers[(device.site_id, row["metric"])].items() if device_id != device.id]
        if len(values) >= 2 and abs(row["value"] - median(values)) > margins[row["metric"]]:
            row["quality_status"] = "suspicious"
            row["quality_reason"] = "Spatial outlier: disagrees with at least two recent sensors at this site"
        elif row["metric"] == "temperature_c" and len(values) >= 2:
            baseline = median(values)
            history = recent_temperatures[device.id]
            offsets = [value - baseline for value in [*history, row["value"]]]
            if len(history) == 4 and (all(offset > 2.5 for offset in offsets) or all(offset < -2.5 for offset in offsets)):
                row["quality_status"] = "suspicious"
                row["quality_reason"] = "Persistent temperature drift: five readings disagree with site peers by more than 2.5 C"
