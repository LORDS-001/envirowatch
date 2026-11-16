from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, IngestionEvent, Measurement, Site, User
from app.schemas.measurement import LatencyOut, SystemHealthOut

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", response_model=SystemHealthOut)
def system_health(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    window = 60
    org = Site.organization_id == user.organization_id

    outcomes = dict(
        db.execute(
            select(IngestionEvent.outcome, func.count())
            .join(Device, IngestionEvent.device_id == Device.id)
            .join(Site, Device.site_id == Site.id)
            .where(org, IngestionEvent.received_at >= now - timedelta(seconds=window))
            .group_by(IngestionEvent.outcome)
        ).all()
    )
    total = sum(outcomes.values())
    errors = outcomes.get("rejected", 0)

    quality = dict(
        db.execute(
            select(Measurement.quality_status, func.count())
            .join(Device, Measurement.device_id == Device.id)
            .join(Site, Device.site_id == Site.id)
            .where(org, Measurement.received_at >= now - timedelta(hours=1))
            .group_by(Measurement.quality_status)
        ).all()
    )
    stored = sum(quality.values())
    written_last_minute = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(org, Measurement.received_at >= now - timedelta(seconds=window))
    )

    error_rate = errors / total if total else 0.0
    return SystemHealthOut(
        status="degraded" if error_rate > 0.05 else "ok",
        generated_at=now,
        queue_depth=0,  # real value once the queue exists
        ingest_rate_per_s=total / window,
        latency_ms=LatencyOut(p50=0, p95=0, p99=0),  # measured once the queue exists
        error_rate=error_rate,
        db_writes_per_s=written_last_minute / window,
        valid_rate_24h=(quality.get("valid", 0) / stored) if stored else None,
    )