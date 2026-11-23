from datetime import timedelta

from sqlalchemy import func, select

from app.models import Device, Measurement, SimulationRun, Site
from app.services.simulation import advance, public_state


def test_simulation_controls_and_isolation(client, db, tenant, auth_headers):
    assert client.get("/api/v1/simulator/run", headers=auth_headers).json() == {"run": None}
    response = client.post("/api/v1/simulator/run", headers=auth_headers, json={"scenario": "custom", "seed": 42, "faults": ["duplicate", "spike", "silent"], "speed": 120})
    assert response.status_code == 201
    assert response.json()["run"]["events"] == []
    run = db.scalar(select(SimulationRun))
    assert run.sandbox_id != tenant[0].id
    assert client.get("/api/v1/devices", headers=auth_headers).json()["items"] == []
    assert client.post("/api/v1/simulator/run", headers=auth_headers, json={"scenario": "baseline", "seed": 42, "speed": 60}).status_code == 409
    assert client.post("/api/v1/simulator/run/pause", headers=auth_headers).json()["run"]["status"] == "paused"
    previous = run.state["elapsed_s"]
    advance(db, run, run.started_at + timedelta(hours=1))
    assert run.state["elapsed_s"] == previous
    assert client.post("/api/v1/simulator/run/resume", headers=auth_headers).status_code == 200
    advance(db, run, run.started_at + timedelta(seconds=100))
    state = public_state(run)["run"]
    assert state["elapsed_s"] == 600
    assert any(event["fault_type"] == "duplicate" and event["outcome"] == "detected" for event in state["events"])
    assert any(event["fault_type"] == "spike" and event["outcome"] == "detected" for event in state["events"])
    assert any(event["fault_type"] == "silent" and event["outcome"] == "detected" for event in state["events"])
    assert db.scalar(select(func.count()).select_from(Measurement)) > 0
    stopped = client.post("/api/v1/simulator/run/stop", headers=auth_headers)
    assert stopped.json()["run"]["status"] == "stopped"
    assert all(event["outcome"] != "pending" for event in stopped.json()["run"]["events"])
    assert client.post("/api/v1/simulator/run/resume", headers=auth_headers).status_code == 409


def test_simulator_validation_and_operator_guard(client, db, tenant, auth_headers):
    assert client.post("/api/v1/simulator/run", headers=auth_headers, json={"scenario": "custom", "seed": 1, "faults": [], "speed": 60}).status_code == 422
    assert client.post("/api/v1/simulator/run", headers=auth_headers, json={"scenario": "baseline", "seed": 1, "speed": 99999}).status_code == 422
    tenant[2].role = "operator"
    db.flush()
    assert client.get("/api/v1/simulator/run", headers=auth_headers).status_code == 403
