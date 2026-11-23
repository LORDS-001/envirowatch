import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, literal_column, select
from sqlalchemy.orm import Session
from pydantic import AwareDatetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle
from xml.sax.saxutils import escape

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Measurement, Site, User
from app.services.ingestion import UNITS
from app.services.measurement_source import measurement_source

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
    from_: AwareDatetime = Query(alias="from"),
    to: AwareDatetime = Query(),
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
    if fmt not in ("csv", "pdf"):
        raise HTTPException(422, detail="Choose CSV or PDF")

    hourly = to - from_ <= timedelta(days=7)
    source_table = measurement_source(db, user.organization_id, from_, to, 3600 if hourly else 86400)
    source = source_table.c
    bucket = func.date_bin(
        literal_column(f"interval '{'1 hour' if hourly else '1 day'}'"),
        source.event_time,
        literal_column(ORIGIN),
    ).label("bucket")
    good = source.quality_status.in_(GOOD)

    q = (
        select(
            bucket, Site.id, Site.name, source.metric,
            func.sum(source.value_sum).filter(good) / func.sum(source.count).filter(good),
            func.min(source.minimum).filter(good),
            func.max(source.maximum).filter(good),
            func.coalesce(func.sum(source.count).filter(good), 0),
            func.coalesce(func.sum(source.count).filter(source.quality_status.notin_(GOOD)), 0),
        )
        .select_from(source_table)
        .join(Device, source.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == user.organization_id,
            source.metric.in_(metrics),
        )
        .group_by(bucket, Site.id, Site.name, source.metric)
        .order_by(bucket, Site.name, source.metric)
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
    if fmt == "pdf":
        if len(rows) > 2000:
            raise HTTPException(422, detail="PDF exports are limited to 2,000 rows. Narrow the range or use CSV.")
        buffer = io.BytesIO()
        document = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=24, rightMargin=24)
        styles = getSampleStyleSheet()
        content = [Paragraph(escape(line), styles["Title"] if index == 0 else styles["BodyText"]) for index, line in enumerate(lines)]
        content.append(Spacer(1, 12))
        data = [["UTC time", "Site", "Metric", "Average", "Min", "Max", "Count", "Excluded"]]
        for bucket_time, _, name, metric, average, minimum, maximum, count, excluded in rows:
            data.append([_utc(bucket_time).strftime("%Y-%m-%d %H:%M"), Paragraph(escape(name), styles["BodyText"]),
                         metric, _num(average), _num(minimum), _num(maximum), str(count), str(excluded)])
        table = LongTable(data, repeatRows=1, colWidths=[112, 175, 110, 65, 65, 65, 65, 65])
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4eeee")),
                                   ("FONTSIZE", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
        content.append(table)
        document.build(content)
        return Response(buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="envirowatch-export-{now:%Y-%m-%d}.pdf"'})
    for line in lines:
        out.write(f"# {line}\n")

    w = csv.writer(out)
    w.writerow(["time_utc", "site_id", "site_name", "metric", "unit", "avg", "min", "max",
                "readings", "excluded_readings"])
    for b, sid, name, metric, avg, mn, mx, n, excluded in rows:
        w.writerow([
            _utc(b).isoformat(timespec="seconds").replace("+00:00", "Z"), _csv_text(sid), _csv_text(name), metric,
            UNITS[metric], _num(avg), _num(mn), _num(mx), n, excluded,
        ])

    filename = f"envirowatch-export-{now.strftime('%Y-%m-%d-%H-%M')}.csv"
    return Response(
        content=out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _csv_text(value: str) -> str:
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value
