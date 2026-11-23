from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Device, IngestionEvent, Measurement, MeasurementRollup, Organization, RetentionSetting, Site

DEFAULTS = {"raw_days": 30, "hourly_days": 365, "daily_days": 1825, "ingestion_events_days": 30}


def apply_retention(db: Session, organization_id, now: datetime | None = None, *, dry_run: bool = True):
    now = now or datetime.now(timezone.utc)
    organization = db.get(Organization, organization_id, with_for_update=True)
    if organization is None:
        raise ValueError("Organization not found")
    row = db.get(RetentionSetting, organization_id)
    policy = {key: getattr(row, key) for key in DEFAULTS} if row else DEFAULTS
    if not 1 <= policy["raw_days"] <= policy["hourly_days"] <= policy["daily_days"]:
        raise ValueError("Stored retention policy is unsafe: raw ≤ hourly ≤ daily is required")
    midnight = now.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = midnight - timedelta(days=policy["raw_days"])
    device_ids = select(Device.id).join(Site, Site.id == Device.site_id).where(Site.organization_id == organization_id)
    old = (Measurement.device_id.in_(device_ids), Measurement.event_time < cutoff)
    events = (IngestionEvent.device_id.in_(device_ids), IngestionEvent.received_at < midnight - timedelta(days=policy["ingestion_events_days"]))
    counts = {"raw_rows": db.scalar(select(func.count()).select_from(Measurement).where(*old)),
              "ingestion_events": db.scalar(select(func.count()).select_from(IngestionEvent).where(*events)),
              "dry_run": dry_run}
    if dry_run:
        return counts
    for granularity in ("hour", "day"):
        bucket = func.date_trunc(granularity, Measurement.event_time, "UTC")
        query = select(Measurement.device_id, Measurement.metric, literal(granularity), bucket,
                       Measurement.quality_status, func.count(), func.sum(Measurement.value),
                       func.min(Measurement.value), func.max(Measurement.value)).where(*old).group_by(
                           Measurement.device_id, Measurement.metric, bucket, Measurement.quality_status)
        statement = insert(MeasurementRollup).from_select(
            ["device_id", "metric", "granularity", "bucket_start", "quality_status", "count", "value_sum", "minimum", "maximum"], query)
        statement = statement.on_conflict_do_update(
            index_elements=["device_id", "metric", "granularity", "bucket_start", "quality_status"],
            set_={"count": MeasurementRollup.count + statement.excluded.count,
                  "value_sum": MeasurementRollup.value_sum + statement.excluded.value_sum,
                  "minimum": func.least(MeasurementRollup.minimum, statement.excluded.minimum),
                  "maximum": func.greatest(MeasurementRollup.maximum, statement.excluded.maximum)})
        db.execute(statement)
    db.execute(delete(Measurement).where(*old))
    db.execute(delete(IngestionEvent).where(*events))
    for granularity, days in (("hour", policy["hourly_days"]), ("day", policy["daily_days"])):
        db.execute(delete(MeasurementRollup).where(MeasurementRollup.device_id.in_(device_ids),
                   MeasurementRollup.granularity == granularity, MeasurementRollup.bucket_start < midnight - timedelta(days=days)))
    db.flush()
    return counts
