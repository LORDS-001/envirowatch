from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models import Organization, SimulationRun, User
from app.services.simulation import create_run, finish, public_state

router = APIRouter(prefix="/simulator", tags=["simulator"])
Fault = Literal["duplicate", "late", "silent", "clock_error", "spike", "drift", "network"]


class StartRun(BaseModel):
    scenario: Literal["baseline", "fault_hour", "custom"]
    seed: int = Field(ge=0, le=2147483647)
    faults: list[Fault] = Field(default_factory=list, max_length=7)
    speed: float = Field(default=60, ge=1, le=120, allow_inf_nan=False)

    @model_validator(mode="after")
    def custom_faults(self):
        if self.scenario == "custom" and not self.faults:
            raise ValueError("Choose at least one fault")
        return self


def latest(db, organization_id):
    return db.scalar(select(SimulationRun).where(SimulationRun.organization_id == organization_id).order_by(SimulationRun.started_at.desc()).limit(1))


@router.get("/run")
def status(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return public_state(latest(db, admin.organization_id))


@router.post("/run", status_code=201)
def start(body: StartRun, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    db.get(Organization, admin.organization_id, with_for_update=True)
    existing = latest(db, admin.organization_id)
    if existing and existing.status in ("running", "paused"):
        raise HTTPException(409, detail="Stop the current run before starting another")
    run = create_run(db, admin.organization_id, body.scenario, body.seed, body.faults, body.speed)
    db.commit()
    return public_state(run)


@router.post("/run/{action}")
def control(action: Literal["pause", "resume", "stop"], db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    db.get(Organization, admin.organization_id, with_for_update=True)
    run = db.scalar(select(SimulationRun).where(SimulationRun.organization_id == admin.organization_id).order_by(SimulationRun.started_at.desc()).limit(1).with_for_update())
    if run is None or run.status not in ("running", "paused"):
        raise HTTPException(409, detail="There is no active run")
    if action == "stop":
        finish(run, "stopped")
    elif action == "pause" and run.status == "running":
        run.status = "paused"
    elif action == "resume" and run.status == "paused":
        run.status = "running"
        run.next_tick_at = datetime.now(timezone.utc)
    else:
        raise HTTPException(409, detail="That control is not available in the current state")
    db.commit()
    return public_state(run)
