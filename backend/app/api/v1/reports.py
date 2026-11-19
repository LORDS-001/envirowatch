import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, literal_column, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Measurement, Site, User
from app.services.ingestion import UNITS

router = APIRouter(prefix="/reports", tags=["reports"])

GOOD = ["valid", "estimated"]
ORIGIN = "timestamptz '2000-01-01 00:00:00+00'"
MAX_ROWS = 50_000
NOTES = [
    "Averages, minimums and maximums use valid and estimated readings only.",
    "Suspicious and quarantined readings are excluded and counted in excluded_readings.",
    "Readings are grouped by device event time in UTC.",
]


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _num(x) -> str:
    return "" if x is None else f"{float(x):.2f}"


@router.get("/export")
def export(
    fmt: str = Query("csv", alias="format"),
    metrics: list[str] = Query(default=[]),
    site_ids: list[str] = Query(default=[]),
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    quality_notes: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    from_, to = _utc(from_), min(_utc(to), now)
    if not metrics:
        raise HTTPException(422, detail="Choose at least one metric")
    if any(m not in UNITS for m in metrics):
        raise HTTPException(422, detail="Unknown metric")
    if to <= from_:
        raise HTTPException(422, detail="Choose a valid time range")
    if to - from_ > timedelta(days=90):
        raise HTTPException(422, detail="Exports are limited to 90 days")
    if fmt == "pdf":
        raise HTTPException(501, detail="PDF export is not available yet. Use CSV.")

    hourly = to - from_ <= timedelta(days=7)
    bucket = func.date_bin(
        literal_column(f"interval '{'1 hour' if hourly else '1 day'}'"),
        Measurement.event_time,
        literal_column(ORIGIN),
    ).label("bucket")
    good = Measurement.quality_status.in_(GOOD)

    q = (
        select(
            bucket, Site.id, Site.name, Measurement.metric,
            func.avg(Measurement.value).filter(good),
            func.min(Measurement.value).filter(good),
            func.max(Measurement.value).filter(good),
            func.count().filter(good),
            func.count().filter(Measurement.quality_status.notin_(GOOD)),
        )
        .select_from(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == user.organization_id,
            Measurement.metric.in_(metrics),
            Measurement.event_time >= from_,
            Measurement.event_time < to,
        )
        .group_by(bucket, Site.id, Site.name, Measurement.metric)
        .order_by(bucket, Site.name, Measurement.metric)
        .limit(MAX_ROWS + 1)
    )
    if site_ids:
        q = q.where(Site.id.in_(site_ids))

    rows = db.execute(q).all()
    truncated = len(rows) > MAX_ROWS
    rows = rows[:MAX_ROWS]

    out = io.StringIO()
    out.write("\ufeff")  
    lines = [
        "EnviroWatch export",
        f"Generated {now.isoformat(timespec='seconds').replace('+00:00', 'Z')}",
        f"Range {from_.isoformat(timespec='seconds').replace('+00:00', 'Z')} to "
        f"{to.isoformat(timespec='seconds').replace('+00:00', 'Z')} (UTC)",
        f"Summary {'hourly' if hourly else 'daily'} per site",
        "Units " + "; ".join(f"{m} = {UNITS[m]}" for m in metrics),
    ]
    if truncated:
        lines.append(f"Truncated at {MAX_ROWS} rows; narrow the range or sites")
    if quality_notes:
        lines += [f"Quality note: {n}" for n in NOTES]
    for line in lines:
        out.write(f"# {line}\n")

    w = csv.writer(out)
    w.writerow(["time_utc", "site_id", "site_name", "metric", "unit", "avg", "min", "max",
                "readings", "excluded_readings"])
    for b, sid, name, metric, avg, mn, mx, n, excluded in rows:
        w.writerow([
            _utc(b).isoformat(timespec="seconds").replace("+00:00", "Z"), sid, name, metric,
            UNITS[metric], _num(avg), _num(mn), _num(mx), n, excluded,
        ])

    filename = f"envirowatch-export-{now.strftime('%Y-%m-%d-%H-%M')}.csv"
    return Response(
        content=out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )