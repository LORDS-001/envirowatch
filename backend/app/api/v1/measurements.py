import json
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, literal_column, select, tuple_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Measurement, Site, User
from app.schemas.measurement import AggregateOut, MeasurementOut, MeasurementPage, MetricId

router = APIRouter(prefix="/measurements", tags=["measurements"])

BUCKETS = {"1m": "1 minute", "15m": "15 minutes", "1h": "1 hour", "6h": "6 hours", "1d": "1 day"}
ORIGIN = "timestamptz '2000-01-01 00:00:00+00'"
GOOD = ["valid", "estimated"]


def _encode_cursor(m: Measurement) -> str:
    return json.dumps([m.event_time.isoformat(), m.device_id, m.reading_id, m.metric])


def _decode_cursor(raw: str):
    try:
        t, device_id, reading_id, metric = json.loads(raw)
        return datetime.fromisoformat(t), device_id, reading_id, metric
    except (ValueError, TypeError):
        raise HTTPException(400, detail="Invalid cursor")


def _scoped(user: User):
    """Measurements restricted to the caller's organization."""
    return (
        select(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(Site.organization_id == user.organization_id)
    )


@router.get("", response_model=MeasurementPage)
def list_measurements(
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    device_id: str | None = None,
    site_id: uuid.UUID | None = None,
    metric: MetricId | None = None,
    cursor: str | None = None,
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if to <= from_:
        raise HTTPException(422, detail="'to' must be after 'from'")
    if to - from_ > timedelta(hours=24):
        raise HTTPException(422, detail="Raw readings are limited to a 24-hour window")

    q = _scoped(user).where(Measurement.event_time >= from_, Measurement.event_time < to)
    if device_id:
        q = q.where(Measurement.device_id == device_id)
    if site_id:
        q = q.where(Device.site_id == site_id)
    if metric:
        q = q.where(Measurement.metric == metric)

    key = (Measurement.event_time, Measurement.device_id, Measurement.reading_id, Measurement.metric)
    if cursor:
        q = q.where(tuple_(*key) < tuple_(*_decode_cursor(cursor)))
    rows = list(db.scalars(q.order_by(*(c.desc() for c in key)).limit(limit + 1)))

    items = rows[:limit]
    return MeasurementPage(
        items=items, next_cursor=_encode_cursor(items[-1]) if len(rows) > limit else None
    )


@router.get("/aggregates", response_model=list[AggregateOut])
def aggregates(
    metric: MetricId,
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    bucket: Literal["1m", "15m", "1h", "6h", "1d"] = "1h",
    group_by: Literal["all", "site", "device"] = "all",
    device_id: str | None = None,
    site_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if to <= from_:
        raise HTTPException(422, detail="'to' must be after 'from'")
    if to - from_ > timedelta(days=92):
        raise HTTPException(422, detail="Aggregates are limited to 92 days")
    if group_by == "site" and site_id is None:
        raise HTTPException(422, detail="group_by=site needs site_id")
    if group_by == "device" and device_id is None and site_id is None:
        raise HTTPException(422, detail="group_by=device needs device_id or site_id")

    bucket_start = func.date_bin(
        literal_column(f"interval '{BUCKETS[bucket]}'"),  # value comes from our own table
        Measurement.event_time,
        literal_column(ORIGIN),
    ).label("bucket_start")

    cols = [bucket_start, func.min(Measurement.value), func.max(Measurement.value),
            func.avg(Measurement.value), func.count()]
    q = (
        select(*cols)
        .select_from(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == user.organization_id,
            Measurement.metric == metric,
            Measurement.event_time >= from_,
            Measurement.event_time < to,
            Measurement.quality_status.in_(GOOD),
        )
    )
    if device_id:
        q = q.where(Measurement.device_id == device_id)
    if site_id:
        q = q.where(Device.site_id == site_id)

    if group_by == "device":
        q = q.add_columns(Measurement.device_id).group_by(bucket_start, Measurement.device_id)
    else:
        q = q.group_by(bucket_start)
    rows = db.execute(q.order_by(bucket_start).limit(20000)).all()

    return [
        AggregateOut(
            device_id=r[5] if group_by == "device" else None,
            metric=metric,
            bucket_start=r[0],
            min=r[1],
            max=r[2],
            avg=r[3],
            count=r[4],
        )
        for r in rows
    ]
