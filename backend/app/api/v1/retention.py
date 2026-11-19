from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models import RetentionSetting, User

router = APIRouter(prefix="/retention", tags=["retention"])

DEFAULTS = {"raw_days": 30, "hourly_days": 365, "daily_days": 1825, "ingestion_events_days": 30}


class RetentionBody(BaseModel):
    raw_days: int = Field(ge=1, le=3650)
    hourly_days: int = Field(ge=1, le=3650)
    daily_days: int = Field(ge=1, le=3650)
    ingestion_events_days: int = Field(ge=1, le=3650)


def _out(row: RetentionSetting) -> dict:
    return {k: getattr(row, k) for k in DEFAULTS}


@router.get("")
def get_retention(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    row = db.get(RetentionSetting, admin.organization_id)
    return _out(row) if row else dict(DEFAULTS)


@router.put("")
def put_retention(body: RetentionBody, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    row = db.get(RetentionSetting, admin.organization_id)
    if row is None:
        row = RetentionSetting(organization_id=admin.organization_id)
        db.add(row)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return _out(row)