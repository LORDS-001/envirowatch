from copy import deepcopy
from datetime import datetime, timedelta, timezone
import random
import uuid

from sqlalchemy.orm import Session

from app.models import Device, Organization, SimulationRun, Site
from app.services.health import evaluate
from app.services.ingestion import Item, process_batch
from simulator.run import environment, METRICS

FAULTS = ["duplicate", "late", "silent", "clock_error", "spike", "drift", "network"]


def create_run(db: Session, organization_id, scenario: str, seed: int, faults: list[str], speed: float) -> SimulationRun:
    now = datetime.now(timezone.utc)
    run_id = f"run-{uuid.uuid4().hex[:16]}"
    sandbox = Organization(id=uuid.uuid4(), name=f"Simulation {run_id}")
    db.add(sandbox)
    db.flush()
    site = Site(id=f"{run_id}-site", organization_id=sandbox.id, name="Isolated simulator site", latitude=6.5, longitude=3.4)
    db.add(site)
    db.flush()
    device_ids = [f"{run_id}-sensor-{index:02}" for index in range(12)]
    db.add_all([Device(id=device_id, site_id=site.id, type="simulation", metrics=METRICS, last_seen_at=now) for device_id in device_ids])
    selected = [] if scenario == "baseline" else FAULTS if scenario == "fault_hour" else list(dict.fromkeys(faults))
    rng = random.Random(seed)
    plan = []
    if selected:
        for index in range(32):
            fault = selected[index % len(selected)]
            plan.append({"id": f"fault-{index:03}", "fault_type": fault, "device_id": device_ids[index % len(device_ids)],
                         "injected_s": 120 + index * 90 + rng.randrange(0, 3) * 10,
                         "detected_s": None, "outcome": "pending"})
    state = {"id": run_id, "scenario": scenario, "seed": seed, "faults": selected, "speed": speed,
             "status": "running", "started_at": now.isoformat(), "elapsed_s": 0,
             "duration_s": 1800 if scenario == "baseline" else 3600, "events": plan,
             "false_alerts": [], "device_ids": device_ids, "previous_detections": []}
    run = SimulationRun(id=run_id, organization_id=organization_id, sandbox_id=sandbox.id,
                        status="running", started_at=now, next_tick_at=now, state=state)
    db.add(run)
    db.flush()
    return run


def public_state(run: SimulationRun | None):
    if run is None:
        return {"run": None}
    state = {key: value for key, value in run.state.items() if key not in ("device_ids", "previous_detections")}
    state["status"] = run.status
    state["events"] = [event for event in state["events"] if event["injected_s"] <= state["elapsed_s"]]
    return {"run": state}


def finish(run: SimulationRun, status: str):
    state = deepcopy(run.state)
    for event in state["events"]:
        if event["injected_s"] <= state["elapsed_s"] and event["outcome"] == "pending":
            event["outcome"] = "missed"
    run.state = state
    run.status = status


def advance(db: Session, run: SimulationRun, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    state = deepcopy(run.state)
    steps = 0
    if run.status == "running":
        state["worker_heartbeat_at"] = now.isoformat()
    while run.status == "running" and run.next_tick_at <= now and steps < 60:
        elapsed = state["elapsed_s"]
        clock = run.started_at + timedelta(seconds=elapsed)
        items = []
        for device_id in state["device_ids"]:
            values = environment(state["seed"], device_id.rsplit("-", 1)[-1], elapsed // 10, clock)
            timestamp = clock
            active = [event for event in state["events"] if event["device_id"] == device_id and
                      event["injected_s"] <= elapsed < event["injected_s"] + _duration(event["fault_type"])]
            if any(event["fault_type"] in ("silent", "network") for event in active):
                continue
            for event in active:
                fault = event["fault_type"]
                if fault == "spike":
                    values["pm25"] += 300
                elif fault == "drift":
                    values["temperature_c"] += min(9, (elapsed - event["injected_s"]) / 60)
                elif fault == "late":
                    timestamp -= timedelta(minutes=6)
                elif fault == "clock_error":
                    timestamp += timedelta(hours=1)
            item = Item(device_id, {"reading_id": f"tick-{elapsed}", "timestamp": timestamp.isoformat(), "measurements": values}, clock)
            items.append(item)
            if any(event["fault_type"] == "duplicate" for event in active):
                items.append(item)
        results = process_batch(db, items, commit=False)
        detections = set()
        for result in results:
            if result.outcome in ("duplicate", "late"):
                detections.add((result.device_id, result.outcome))
            if result.reason and result.reason.startswith("clock error"):
                detections.add((result.device_id, "clock_error"))
            if any(row["quality_status"] == "suspicious" and row["metric"] == "pm25" for row in result.rows):
                detections.add((result.device_id, "spike"))
        for device in db.identity_map.values():
            if isinstance(device, Device):
                db.expire(device)
        for health in evaluate(db, run.sandbox_id, clock):
            for event in health.events:
                detections.add((event.device_id, event.fault_type))
        previous = {tuple(value) for value in state["previous_detections"]}
        for device_id, fault in sorted(detections):
            matches = [event for event in state["events"] if event["device_id"] == device_id and
                       (event["fault_type"] == fault or fault == "silent" and event["fault_type"] == "network") and
                       event["injected_s"] <= elapsed <= event["injected_s"] + _duration(event["fault_type"]) + 300]
            pending = next((event for event in matches if event["outcome"] == "pending"), None)
            if pending:
                pending.update(detected_s=elapsed, outcome="detected")
            elif not matches and (device_id, fault) not in previous:
                state["false_alerts"].append({"id": uuid.uuid4().hex, "device_id": device_id, "fault_type": fault, "detected_s": elapsed})
        for event in state["events"]:
            if event["outcome"] == "pending" and elapsed > event["injected_s"] + _duration(event["fault_type"]) + 300:
                event["outcome"] = "missed"
        state["previous_detections"] = sorted(detections)
        state["elapsed_s"] = min(elapsed + 10, state["duration_s"])
        run.next_tick_at += timedelta(seconds=10 / state["speed"])
        steps += 1
        if state["elapsed_s"] >= state["duration_s"]:
            run.status = "completed"
    run.state = state
    if run.status == "completed":
        finish(run, "completed")
    db.flush()


def _duration(fault: str) -> int:
    return 900 if fault == "drift" else 180 if fault in ("silent", "network") else 10
