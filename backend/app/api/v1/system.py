from datetime import datetime, timedelta, timezone

import redis
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.queue import LATENCY_KEY, STREAM, get_redis
from app.db.session import get_db
from app.models import Device, IngestionEvent, Measurement, Site, User
from app.schemas.measurement import LatencyOut, SystemHealthOut

router = APIRouter(prefix="/system", tags=["system"])


def _queue_stats() -> tuple[bool, int, list[int]]:
    try:
        r = get_redis()
        depth = r.xlen(STREAM)
        values = sorted(int(v) for v in r.lrange(LATENCY_KEY, 0, 4999))
        return True, depth, values
    except redis.RedisError:
        return False, 0, []


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
            .where(org, Measurement.received_at >= now - timedelta(hours=24))
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

    redis_ok, depth, lat = _queue_stats()

    def pick(q: float) -> float:
        return float(lat[min(len(lat) - 1, int(q * len(lat)))]) if lat else 0.0

    error_rate = errors / total if total else 0.0
    if not redis_ok:
        status = "down"
    elif error_rate > 0.05 or depth > 5000:
        status = "degraded"
    else:
        status = "ok"

    return SystemHealthOut(
        status=status,
        generated_at=now,
        queue_depth=depth,
        ingest_rate_per_s=total / window,
        latency_ms=LatencyOut(p50=pick(0.5), p95=pick(0.95), p99=pick(0.99)),
        error_rate=error_rate,
        db_writes_per_s=written_last_minute / window,
        valid_rate_24h=(quality.get("valid", 0) / stored) if stored else None,
    )
