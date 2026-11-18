from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Device, Measurement, Site
from app.schemas.health import DeviceHealthEventOut

SILENT_AFTER = timedelta(minutes=2)
WINDOW = timedelta(minutes=30)
SPIKE_WINDOW = timedelta(minutes=10)
MIN_READINGS = 5
SPIKE_MARGIN = {"pm25": 150.0, "temperature_c": 10.0, "humidity_percent": 35.0}
DRIFT_MARGIN = {"temperature_c": 2.5}


@dataclass
class DeviceHealth:
    device: Device
    health: str
    events: list[DeviceHealthEventOut]


def evaluate(db: Session, org_id, now: datetime | None = None) -> list[DeviceHealth]:
    now = now or datetime.now(timezone.utc)

    devices = list(
        db.scalars(
            select(Device)
            .join(Site, Device.site_id == Site.id)
            .where(Site.organization_id == org_id)
            .order_by(Device.id)
        )
    )

    rows = db.execute(
        select(
            Measurement.device_id,
            Measurement.metric,
            func.avg(Measurement.value),
            func.count(),
            func.max(Measurement.value).filter(Measurement.event_time > now - SPIKE_WINDOW),
        )
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == org_id,
            Measurement.event_time > now - WINDOW,
            Measurement.event_time <= now + timedelta(minutes=5),
            Measurement.quality_status.in_(["valid", "estimated"]),
        )
        .group_by(Measurement.device_id, Measurement.metric)
    ).all()
    stats = {(r[0], r[1]): (float(r[2]), r[3], r[4]) for r in rows}  # avg, count, recent max

    per_metric = defaultdict(list)
    for (_, metric), (avg, n, _mx) in stats.items():
        if n >= MIN_READINGS:
            per_metric[metric].append(avg)
    baseline = {m: median(v) for m, v in per_metric.items() if len(v) >= 3}

    results = []
    for d in devices:
        events: list[DeviceHealthEventOut] = []

        def add(fault, severity, detail):
            events.append(DeviceHealthEventOut(
                device_id=d.id, fault_type=fault, severity=severity, detected_at=now, detail=detail))

        if d.status == "deactivated":
            results.append(DeviceHealth(d, "deactivated", events))
            continue

        age = None if d.last_seen_at is None else now - d.last_seen_at
        if age is None or age > SILENT_AFTER:
            add("silent", "critical",
                "never reported" if age is None else f"no reading for {int(age.total_seconds() // 60)} min")
            results.append(DeviceHealth(d, "silent", events))
            continue

        drifting = False
        for metric in d.metrics:
            s, base = stats.get((d.id, metric)), baseline.get(metric)
            if s is None or base is None or s[1] < MIN_READINGS:
                continue
            avg, _n, recent_max = s
            if recent_max is not None and recent_max - base > SPIKE_MARGIN[metric]:
                add("spike", "warn", f"{metric} reached {recent_max:.1f} against a fleet median of {base:.1f}")
            margin = DRIFT_MARGIN.get(metric)
            if margin and abs(avg - base) > margin:
                drifting = True
                add("drift", "warn", f"{metric} averages {avg - base:+.1f} against the fleet median over 30 min")

        health = "drifting" if drifting else ("suspicious" if events else "online")
        results.append(DeviceHealth(d, health, events))
    return results