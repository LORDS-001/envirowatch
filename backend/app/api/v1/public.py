import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import distinct_on

from app.core.config import settings
from app.db.session import get_db
from app.models import Device, Measurement, Site
from app.schemas.measurement import MetricId
from app.services.ingestion import UNITS

router = APIRouter(prefix="/public", tags=["public"])
GOOD = ["valid"]


def approved_sites(db: Session):
    organizations = [UUID(value) for value in settings.public_organization_ids]
    return list(db.scalars(select(Site).where(Site.organization_id.in_(organizations)).order_by(Site.id)))


def samples(db: Session, metric: str, now: datetime):
    sites = approved_sites(db)
    latest = (
        select(Measurement.device_id, Measurement.value, Measurement.event_time, Measurement.received_at, Measurement.quality_status)
        .join(Device, Device.id == Measurement.device_id)
        .where(Device.site_id.in_([site.id for site in sites]), Device.status == "active",
               Measurement.metric == metric, Measurement.event_time > now - timedelta(seconds=30),
               Measurement.event_time <= now)
        .ext(distinct_on(Measurement.device_id))
        .order_by(Measurement.device_id, Measurement.event_time.desc(), Measurement.received_at.desc())
        .subquery()
    )
    rows = db.execute(
        select(Device.site_id, func.avg(latest.c.value), func.max(latest.c.event_time),
               func.max(latest.c.received_at), func.count(), func.bool_or(latest.c.quality_status == "estimated"))
        .join(Device, Device.id == latest.c.device_id)
        .where(latest.c.quality_status.in_(GOOD))
        .group_by(Device.site_id)
    ).all()
    positions = {site.id: site for site in sites}
    return [{"site_id": site_id, "latitude": positions[site_id].latitude,
             "longitude": positions[site_id].longitude, "value": float(value),
             "event_time": event_time, "received_at": received_at, "device_count": count,
             "quality_status": "estimated" if estimated else "valid"}
            for site_id, value, event_time, received_at, count, estimated in rows]


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    areas = {site.id: {"site_id": site.id, "name": site.name, "latitude": site.latitude,
                       "longitude": site.longitude, "readings": []} for site in approved_sites(db)}
    for metric in UNITS:
        for sample in samples(db, metric, now):
            areas[sample["site_id"]]["readings"].append({key: sample[key] for key in ("value", "event_time", "quality_status")} | {"metric": metric})
    return {"generated_at": now, "areas": list(areas.values())}


@router.get("/heatmap")
def heatmap(metric: MetricId, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    return {"metric": metric, "unit": UNITS[metric], "generated_at": now, "samples": samples(db, metric, now)}


@router.get("/trend")
def trend(metric: MetricId, hours: int = Query(24, ge=1, le=24), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    bucket = func.date_trunc("hour", Measurement.event_time)
    rows = db.execute(
        select(bucket, func.avg(Measurement.value))
        .join(Device, Device.id == Measurement.device_id)
        .where(Device.site_id.in_([site.id for site in approved_sites(db)]), Device.status == "active",
               Measurement.metric == metric, Measurement.quality_status.in_(GOOD),
               Measurement.event_time >= now - timedelta(hours=hours), Measurement.event_time <= now)
        .group_by(bucket).order_by(bucket)
    ).all()
    return {"metric": metric, "unit": UNITS[metric], "points": [{"bucket_start": bucket_start, "avg": float(value)} for bucket_start, value in rows]}


@router.get("/export.csv")
def export(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["site_id", "metric", "value", "unit", "quality_status", "event_time_utc"])
    for metric in UNITS:
        for sample in samples(db, metric, now):
            site_id = sample["site_id"]
            safe_id = "'" + site_id if site_id.lstrip().startswith(("=", "+", "-", "@")) else site_id
            writer.writerow([safe_id, metric, sample["value"], UNITS[metric], sample["quality_status"], sample["event_time"].isoformat()])
    return Response(output.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="envirowatch-public.csv"'})
