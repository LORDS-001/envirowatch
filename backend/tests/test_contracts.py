from datetime import datetime, timedelta, timezone

from app.models import Device, IngestionEvent


def test_device_pagination(client, db, tenant, auth_headers):
    _, site, _ = tenant
    db.add_all([Device(id=f"test-sensor-{index:03}", site_id=site.id, type="sensor", metrics=["pm25"]) for index in range(53)])
    db.flush()
    first = client.get("/api/v1/devices?limit=50", headers=auth_headers)
    assert first.status_code == 200
    assert len(first.json()["items"]) == 50
    second = client.get("/api/v1/devices", params={"cursor": first.json()["next_cursor"], "limit": 50}, headers=auth_headers)
    assert len(second.json()["items"]) == 3
    assert second.json()["next_cursor"] is None


def test_aggregate_contract_and_timezone_validation(client, auth_headers):
    now = datetime.now(timezone.utc)
    params = {"metric": "pm25", "from": (now - timedelta(hours=1)).isoformat(), "to": now.isoformat()}
    response = client.get("/api/v1/measurements/aggregates", params=params, headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"items": [], "next_cursor": None}
    params["from"] = "2026-11-21T00:00:00"
    assert client.get("/api/v1/measurements", params=params, headers=auth_headers).status_code == 422


def test_ingestion_event_envelope(client, db, tenant, auth_headers):
    _, site, _ = tenant
    device = Device(id="test-sensor-events", site_id=site.id, type="sensor", metrics=["pm25"])
    db.add(device)
    db.flush()
    db.add(IngestionEvent(device_id=device.id, reading_id="test-reading", outcome="accepted", received_at=datetime.now(timezone.utc)))
    db.flush()
    response = client.get(f"/api/v1/devices/{device.id}/ingestion-events", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["items"][0]["reading_id"] == "test-reading"
    assert response.json()["next_cursor"] is None


def test_site_creation_and_operator_guard(client, db, tenant, auth_headers):
    response = client.post("/api/v1/sites", headers=auth_headers, json={"name": " New site ", "latitude": 6.6, "longitude": 3.5})
    assert response.status_code == 201
    assert response.json()["name"] == "New site"
    assert response.json()["organization_id"] == str(tenant[0].id)
    assert client.post("/api/v1/sites", headers=auth_headers, json={"name": "Bad", "latitude": 91, "longitude": 3}).status_code == 422
    tenant[2].role = "operator"
    db.flush()
    assert client.post("/api/v1/sites", headers=auth_headers, json={"name": "Denied", "latitude": 6, "longitude": 3}).status_code == 403


def test_cross_tenant_devices_are_not_visible(client, db, tenant, auth_headers):
    import uuid
    from app.models import Organization, Site

    other = Organization(id=uuid.uuid4(), name="Other community")
    db.add(other)
    db.flush()
    site = Site(id="other-site", organization_id=other.id, name="Other site", latitude=6, longitude=3)
    db.add(site)
    db.flush()
    db.add(Device(id="other-sensor", site_id=site.id, type="sensor", metrics=["pm25"]))
    db.flush()
    assert client.get("/api/v1/devices/other-sensor", headers=auth_headers).status_code == 404
    assert client.get("/api/v1/devices", params={"organization_id": str(other.id)}, headers=auth_headers).status_code == 403
