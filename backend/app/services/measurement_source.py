from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import exists, func, literal, select, union_all, case
from sqlalchemy.orm import aliased

from app.models import Device, Measurement, MeasurementRollup, Site


def measurement_source(db, organization_id, from_: datetime, to: datetime, resolution_seconds: int):
    from_, to = from_.astimezone(timezone.utc), to.astimezone(timezone.utc)
    device_ids = select(Device.id).join(Site, Site.id == Device.site_id).where(Site.organization_id == organization_id)
    hourly = aliased(MeasurementRollup)
    has_hours = exists(select(hourly.device_id).where(
        hourly.device_id == MeasurementRollup.device_id, hourly.metric == MeasurementRollup.metric,
        hourly.quality_status == MeasurementRollup.quality_status, hourly.granularity == "hour",
        hourly.bucket_start >= MeasurementRollup.bucket_start,
        hourly.bucket_start < MeasurementRollup.bucket_start + timedelta(days=1)))
    chosen = (MeasurementRollup.granularity == "hour") | ((MeasurementRollup.granularity == "day") & ~has_hours)
    relevant = [MeasurementRollup.device_id.in_(device_ids), chosen,
                MeasurementRollup.bucket_start < to,
                MeasurementRollup.bucket_start + case((MeasurementRollup.granularity == "hour", timedelta(hours=1)), else_=timedelta(days=1)) > from_,
                MeasurementRollup.bucket_start >= from_.replace(hour=0, minute=0, second=0, microsecond=0)]
    retained = db.execute(select(MeasurementRollup.granularity, func.min(MeasurementRollup.bucket_start), func.max(MeasurementRollup.bucket_start)).where(*relevant).group_by(MeasurementRollup.granularity)).all()
    for granularity, first, last in retained:
        seconds = 3600 if granularity == "hour" else 86400
        if resolution_seconds < seconds:
            raise HTTPException(422, detail=f"This range contains retained {granularity}ly summaries. Choose a coarser bucket or a more recent range.")
        if first < from_ or last + timedelta(seconds=seconds) > to:
            raise HTTPException(422, detail=f"Retained {granularity}ly summaries require whole UTC {granularity} boundaries. Adjust the time range.")
    raw = select(Measurement.device_id, Measurement.metric, Measurement.event_time,
                 Measurement.quality_status, literal(1).label("count"), Measurement.value.label("value_sum"),
                 Measurement.value.label("minimum"), Measurement.value.label("maximum")).where(
                     Measurement.device_id.in_(device_ids), Measurement.event_time >= from_, Measurement.event_time < to)
    rolled = select(MeasurementRollup.device_id, MeasurementRollup.metric, MeasurementRollup.bucket_start,
                    MeasurementRollup.quality_status, MeasurementRollup.count, MeasurementRollup.value_sum,
                    MeasurementRollup.minimum, MeasurementRollup.maximum).where(*relevant, MeasurementRollup.bucket_start >= from_)
    return union_all(raw, rolled).subquery()
