from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import AwareDatetime
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import distinct_on

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Measurement, Site, User
from app.schemas.measurement import MetricId
from app.services.ingestion import UNITS

router = APIRouter(prefix="/heatmap", tags=["map"])

WINDOW = timedelta(seconds=30)


@router.get("")
def heatmap(
    metric: MetricId,
    at: AwareDatetime | None = None,
    include_suspicious: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    ref = at or now

    # Latest good reading per device inside the window, then averaged per site
    latest = (
        select(Measurement.device_id, Measurement.value, Measurement.event_time, Measurement.received_at, Measurement.quality_status)
        .where(
            Measurement.metric == metric,
            Measurement.event_time > ref - WINDOW,
            Measurement.event_time <= ref,
        )
        .ext(distinct_on(Measurement.device_id))
        .order_by(Measurement.device_id, Measurement.event_time.desc())
        .subquery()
    )
    rows = db.execute(
        select(
            Site.id, Site.latitude, Site.longitude,
            func.avg(latest.c.value), func.max(latest.c.event_time),
            func.max(latest.c.received_at), func.count(),
            func.bool_or(latest.c.quality_status == "suspicious"),
            func.bool_or(latest.c.quality_status == "estimated"),
        )
        .select_from(latest)
        .join(Device, Device.id == latest.c.device_id)
        .join(Site, Site.id == Device.site_id)
        .where(
            Site.organization_id == user.organization_id,
            Device.status == "active",
            latest.c.quality_status.in_(["valid", "suspicious"] if include_suspicious else ["valid"]),
        )
        .group_by(Site.id, Site.latitude, Site.longitude)
    ).all()

    return {
        "metric": metric,
        "unit": UNITS[metric],
        "generated_at": now,
        "samples": [
            {
                "site_id": r[0], "latitude": r[1], "longitude": r[2], "value": float(r[3]),
                "quality_status": "suspicious" if r[7] else "estimated" if r[8] else "valid",
                "event_time": r[4], "received_at": r[5], "device_count": r[6],
            }
            for r in rows
        ],
    }
