from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import select

from app.models import Alert, AlertRule, Device, Measurement, NotificationAttempt, Organization, Site
from app.services.ingestion import Item, process_batch


def sensors(db, tenant, count=3):
    devices = [Device(id=f"sensor-{uuid.uuid4().hex[:10]}", site_id=tenant[1].id, type="sensor", metrics=["pm25"]) for _ in range(count)]
    db.add_all(devices)
    db.flush()
    return devices


def reading(device, value, at, reading_id=None):
    return Measurement(device_id=device.id, reading_id=reading_id or uuid.uuid4().hex, metric="pm25", value=value, unit="µg/m³", quality_status="valid", event_time=at, received_at=at)


def test_public_data_is_opt_in_and_excludes_latest_suspicious(client, db, tenant, monkeypatch):
    from app.core.config import settings

    devices = sensors(db, tenant)
    now = datetime.now(timezone.utc)
    db.add_all([reading(device, 20, now - timedelta(seconds=15)) for device in devices])
    bad = reading(devices[0], 400, now)
    bad.quality_status = "suspicious"
    db.add(bad)
    other = Organization(id=uuid.uuid4(), name="Private")
    db.add(other)
    db.flush()
    site = Site(id=f"private-{uuid.uuid4().hex[:8]}", organization_id=other.id, name="Private site", latitude=6, longitude=3)
    db.add(site)
    db.flush()
    private_device = Device(id=f"private-{uuid.uuid4().hex[:8]}", site_id=site.id, type="sensor", metrics=["pm25"])
    db.add(private_device)
    db.flush()
    db.add(reading(private_device, 900, now))
    db.flush()
    monkeypatch.setattr(settings, "public_organization_ids", [])
    assert client.get("/api/v1/public/summary").json()["areas"] == []
    monkeypatch.setattr(settings, "public_organization_ids", [str(tenant[0].id)])
    response = client.get("/api/v1/public/heatmap?metric=pm25")
    assert response.status_code == 200
    sample = response.json()["samples"][0]
    assert sample["value"] == 20
    assert sample["device_count"] == 2
    assert sample["site_id"] == tenant[1].id
    assert len(client.get("/api/v1/public/summary").json()["areas"]) == 1
    assert client.get("/api/v1/public/trend?metric=pm25").json()["points"][0]["avg"] == 20
    assert client.get("/api/v1/public/export.csv").status_code == 200


def test_pdf_and_csv_exports(client, db, tenant, auth_headers):
    device = sensors(db, tenant, 1)[0]
    now = datetime.now(timezone.utc)
    db.add(reading(device, 25, now - timedelta(minutes=1)))
    tenant[1].name = '=HYPERLINK("unsafe")'
    db.flush()
    params = {"metrics": "pm25", "from": (now - timedelta(hours=1)).isoformat(), "to": now.isoformat(), "quality_notes": "true"}
    csv = client.get("/api/v1/reports/export", params={**params, "format": "csv"}, headers=auth_headers)
    assert csv.status_code == 200
    assert "'=HYPERLINK" in csv.text
    pdf = client.get("/api/v1/reports/export", params={**params, "format": "pdf"}, headers=auth_headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")
    assert pdf.headers["content-type"] == "application/pdf"
    assert client.get("/api/v1/reports/export", params={**params, "format": "unknown"}, headers=auth_headers).status_code == 422


def test_spike_is_excluded_and_duplicates_remain_idempotent(db, tenant):
    devices = sensors(db, tenant)
    now = datetime.now(timezone.utc)
    db.add_all([reading(device, 20, now - timedelta(seconds=20)) for device in devices])
    db.flush()
    item = Item(devices[0].id, {"reading_id": "spike-reading", "timestamp": now.isoformat(), "measurements": {"pm25": 400}}, now)
    result = process_batch(db, [item])[0]
    assert result.rows[0]["quality_status"] == "suspicious"
    assert process_batch(db, [item])[0].outcome == "duplicate"


def test_corroborated_change_is_not_classified_as_sensor_spike(db, tenant):
    devices = sensors(db, tenant)
    now = datetime.now(timezone.utc)
    db.add_all([reading(device, 20, now - timedelta(seconds=20)) for device in devices])
    db.flush()
    items = [Item(device.id, {"reading_id": "regional-change", "timestamp": now.isoformat(), "measurements": {"pm25": 250}}, now) for device in devices]
    results = process_batch(db, items)
    assert all(result.rows[0]["quality_status"] == "valid" for result in results)


def test_alert_confirmation_requires_adjacent_corroborated_intervals(db, tenant):
    from app.services.alerts import _environment_alerts

    devices = sensors(db, tenant, 2)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    now = now - timedelta(seconds=now.second % 10)
    rule = AlertRule(id="test-rule", organization_id=tenant[0].id, name="High PM", metric="pm25", threshold=35, hysteresis=5, consecutive_readings=3, cooldown_min=1, channels=["email"], kind="threshold", enabled=True)
    db.add(rule)
    for offset in (0, 10, 30):
        db.add_all([reading(device, 60, now - timedelta(seconds=offset)) for device in devices])
    db.flush()
    _environment_alerts(db, tenant[0].id, now)
    db.flush()
    alert = db.scalar(select(Alert))
    assert alert.status == "pending"
    db.add_all([reading(device, 60, now - timedelta(seconds=20)) for device in devices])
    db.flush()
    _environment_alerts(db, tenant[0].id, now)
    db.flush()
    assert alert.status == "active"
    assert db.scalar(select(NotificationAttempt)).outcome == "not_configured"
    _environment_alerts(db, tenant[0].id, now + timedelta(minutes=2))
    assert alert.status == "active"


def test_invitation_can_set_password_only_once(client, db, tenant, auth_headers):
    email = f"invite-{uuid.uuid4().hex}@test.invalid"
    response = client.post("/api/v1/users", headers=auth_headers, json={"email": email, "role": "operator"})
    assert response.status_code == 201
    token = response.json()["invitation_token"]
    assert len(token) >= 32
    client.cookies.set("refresh_token", token)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.clear()
    payload = {"token": token, "password": "new-test-password"}
    assert client.post("/api/v1/auth/accept-invitation", json=payload).status_code == 204
    assert client.post("/api/v1/auth/accept-invitation", json=payload).status_code == 400
    assert client.post("/api/v1/auth/login", json={"email": email, "password": payload["password"]}).status_code == 200


def test_invitation_renewal_invalidates_the_previous_link(client, db, tenant, auth_headers):
    from app.models import UserInvitation

    email = f"renew-{uuid.uuid4().hex}@test.invalid"
    first = client.post("/api/v1/users", headers=auth_headers, json={"email": email, "role": "operator"}).json()
    invitation = db.scalar(select(UserInvitation))
    invitation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.flush()
    assert client.post("/api/v1/auth/accept-invitation", json={"token": first["invitation_token"], "password": "a-test-password"}).status_code == 400
    renewed = client.post(f"/api/v1/users/{first['id']}/invitation", headers=auth_headers)
    assert renewed.status_code == 200
    assert renewed.json()["invitation_token"] != first["invitation_token"]
    assert client.post("/api/v1/auth/accept-invitation", json={"token": first["invitation_token"], "password": "a-test-password"}).status_code == 400
    assert client.post("/api/v1/auth/accept-invitation", json={"token": renewed.json()["invitation_token"], "password": "a-test-password"}).status_code == 204
    assert client.post(f"/api/v1/users/{first['id']}/invitation", headers=auth_headers).status_code == 409


def test_refresh_rotation_and_logout(client, tenant):
    user = tenant[2]
    assert client.post("/api/v1/auth/login", json={"email": user.email, "password": "test-password-only"}).status_code == 200
    previous = client.cookies.get("refresh_token")
    assert client.post("/api/v1/auth/refresh").status_code == 200
    current = client.cookies.get("refresh_token")
    assert current != previous
    client.cookies.clear()
    client.cookies.set("refresh_token", previous)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.clear()
    client.cookies.set("refresh_token", current)
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_persistent_drift_is_marked_and_excluded(db, tenant):
    from app.services.health import evaluate

    devices = sensors(db, tenant)
    now = datetime.now(timezone.utc)
    for device in devices:
        device.metrics = ["temperature_c"]
        device.last_seen_at = now
    for device in devices[1:]:
        db.add(Measurement(device_id=device.id, reading_id="peer", metric="temperature_c", value=27, unit="°C", quality_status="valid", event_time=now, received_at=now))
    for index in range(4):
        db.add(Measurement(device_id=devices[0].id, reading_id=f"drift-{index}", metric="temperature_c", value=31, unit="°C", quality_status="valid", event_time=now - timedelta(seconds=(index + 1) * 10), received_at=now))
    db.flush()
    result = process_batch(db, [Item(devices[0].id, {"reading_id": "drift-latest", "timestamp": now.isoformat(), "measurements": {"temperature_c": 31}}, now)])[0]
    assert result.rows[0]["quality_status"] == "suspicious"
    assert result.rows[0]["quality_reason"].startswith("Persistent temperature drift")
    assert next(health for health in evaluate(db, tenant[0].id, now) if health.device.id == devices[0].id).health == "drifting"


def test_unusual_change_rules_are_evaluated(db, tenant):
    from app.services.alerts import _environment_alerts

    devices = sensors(db, tenant, 2)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    now -= timedelta(seconds=now.second % 10)
    db.add(AlertRule(id="change-rule", organization_id=tenant[0].id, name="Sudden increase", metric="pm25", threshold=50, hysteresis=5, consecutive_readings=3, cooldown_min=1, channels=[], kind="unusual_change", enabled=True))
    for device in devices:
        for index in range(10):
            db.add(reading(device, 20, now - timedelta(minutes=5, seconds=index * 10)))
        for offset in (0, 10, 20):
            db.add(reading(device, 40, now - timedelta(seconds=offset)))
    db.flush()
    _environment_alerts(db, tenant[0].id, now)
    db.flush()
    alert = db.scalar(select(Alert))
    assert alert.status == "active"
    assert alert.threshold == 30
    assert alert.hysteresis == 1
