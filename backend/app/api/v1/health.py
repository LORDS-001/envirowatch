from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.health import HealthSummaryItem
from app.services.health import evaluate
from app.schemas.health import HealthSummaryItem, HealthSummaryPage

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/devices", response_model=HealthSummaryPage)
def devices_health(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = [
        HealthSummaryItem(
            device_id=r.device.id,
            site_id=r.device.site_id,
            health=r.health,
            last_seen_at=r.device.last_seen_at,
            latest_event=r.events[0] if r.events else None,
        )
        for r in evaluate(db, user.organization_id)
    ]
    return HealthSummaryPage(items=items, next_cursor=None)