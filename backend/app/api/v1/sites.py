import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Site, User
from app.schemas.site import SitePage

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=SitePage)
def list_sites(
    cursor: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Site).where(Site.organization_id == user.organization_id).order_by(Site.id).limit(limit + 1)
    if cursor is not None:
        q = q.where(Site.id > cursor)
    rows = list(db.scalars(q))
    items = rows[:limit]
    return SitePage(items=items, next_cursor=str(items[-1].id) if len(rows) > limit else None)