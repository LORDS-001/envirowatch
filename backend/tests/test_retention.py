from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import Device, Measurement, MeasurementRollup, RetentionSetting
from app.services.retention import apply_retention


def test_retention_preserves_weighted_aggregates_and_quality(client, db, tenant, auth_headers):
    now = datetime.now(timezone.utc)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=40)
    device = Device(id="retention-sensor", site_id=tenant[1].id, type="sensor", metrics=["pm25"])
    db.add(device)
    db.flush()
    for index, value in enumerate([10, 20, 90]):
        db.add(Measurement(device_id=device.id, reading_id=str(index), metric="pm25", value=value, unit="µg/m³", quality_status="valid", event_time=day + timedelta(minutes=index * 40), received_at=day))
    db.add(Measurement(device_id=device.id, reading_id="bad", metric="pm25", value=999, unit="µg/m³", quality_status="suspicious", event_time=day, received_at=day))
    db.flush()
    params = {"metric": "pm25", "from": day.isoformat(), "to": (day + timedelta(days=1)).isoformat(), "bucket": "1d"}
    before = client.get("/api/v1/measurements/aggregates", params=params, headers=auth_headers).json()
    dry = apply_retention(db, tenant[0].id, now)
    assert dry["raw_rows"] == 4 and dry["dry_run"]
    assert db.scalar(select(func.count()).select_from(MeasurementRollup)) == 0
    apply_retention(db, tenant[0].id, now, dry_run=False)
    assert db.scalar(select(func.count()).select_from(Measurement)) == 0
    after = client.get("/api/v1/measurements/aggregates", params=params, headers=auth_headers)
    assert after.status_code == 200
    assert before == after.json()
    assert after.json()["items"][0]["count"] == 3
    assert after.json()["items"][0]["avg"] == 40
    assert client.get("/api/v1/measurements/aggregates", params={**params, "bucket": "1m"}, headers=auth_headers).status_code == 422
    daily_rollups = db.scalar(select(func.count()).select_from(MeasurementRollup))
    apply_retention(db, tenant[0].id, now, dry_run=False)
    assert db.scalar(select(func.count()).select_from(MeasurementRollup)) == daily_rollups
    policy = RetentionSetting(organization_id=tenant[0].id, raw_days=30, hourly_days=35, daily_days=100, ingestion_events_days=30)
    db.add(policy)
    db.flush()
    apply_retention(db, tenant[0].id, now, dry_run=False)
    assert client.get("/api/v1/measurements/aggregates", params=params, headers=auth_headers).json() == before
    report = client.get("/api/v1/reports/export", params={"metrics": "pm25", "from": day.isoformat(), "to": (day + timedelta(days=8)).isoformat(), "format": "csv"}, headers=auth_headers)
    assert report.status_code == 200
    assert "40.00,10.00,90.00,3,1" in report.text


def test_retention_order_and_missing_readings_are_explicit(client, auth_headers):
    assert client.put("/api/v1/retention", headers=auth_headers, json={"raw_days": 60, "hourly_days": 30, "daily_days": 100, "ingestion_events_days": 7}).status_code == 422
    assert client.get("/api/v1/measurements/quality-summary", headers=auth_headers).status_code == 200
