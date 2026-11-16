import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.security import generate_api_key
from app.db.session import get_db
from app.models import Device, DeviceCredential, Site, User
from app.schemas.device import (
    DeviceCreate,
    DeviceOut,
    DevicePage,
    DevicePatch,
    DeviceWithKey,
    RotatedKey,
)

router = APIRouter(prefix="/devices", tags=["devices"])


def _site_in_org(db: Session, site_id: uuid.UUID, user: User) -> Site:
    site = db.scalar(select(Site).where(Site.id == site_id, Site.organization_id == user.organization_id))
    if site is None:
        raise HTTPException(404, detail="Site not found")
    return site


def _device_in_org(db: Session, device_id: str, user: User) -> Device:
    device = db.scalar(
        select(Device)
        .join(Site, Device.site_id == Site.id)
        .where(Device.id == device_id, Site.organization_id == user.organization_id)
    )
    if device is None:
        raise HTTPException(404, detail="Device not found")
    return device


@router.get("", response_model=DevicePage)
def list_devices(
    site_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
   
    if organization_id is not None and organization_id != user.organization_id:
        raise HTTPException(403, detail="You don't have access to this organization")

    q = (
        select(Device)
        .join(Site, Device.site_id == Site.id)
        .where(Site.organization_id == user.organization_id)
        .order_by(Device.id)
        .limit(limit + 1)
    )
    if site_id is not None:
        q = q.where(Device.site_id == site_id)
    if cursor:
        q = q.where(Device.id > cursor)

    rows = list(db.scalars(q))
    items = rows[:limit]
    return DevicePage(items=items, next_cursor=items[-1].id if len(rows) > limit else None)


@router.post("", response_model=DeviceWithKey, status_code=201)
def register_device(
    body: DeviceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _site_in_org(db, body.site_id, admin)
    if db.get(Device, body.id) is not None:
        raise HTTPException(409, detail="A device with this ID already exists")

    device = Device(id=body.id, site_id=body.site_id, type=body.type, metrics=body.metrics)
    db.add(device)
    raw_key, key_hash = generate_api_key()
    db.add(DeviceCredential(device_id=body.id, key_hash=key_hash))
    db.commit()
    db.refresh(device)
    return DeviceWithKey(device=device, api_key=raw_key)


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(device_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _device_in_org(db, device_id, user)


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: str,
    body: DevicePatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    device = _device_in_org(db, device_id, admin)
    changes = body.model_dump(exclude_unset=True)
    if "site_id" in changes:
        _site_in_org(db, changes["site_id"], admin)
    for field, value in changes.items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.post("/{device_id}/rotate-key", response_model=RotatedKey)
def rotate_key(device_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    device = _device_in_org(db, device_id, admin)
    now = datetime.now(timezone.utc)

    db.execute(
        update(DeviceCredential)
        .where(DeviceCredential.device_id == device.id, DeviceCredential.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    raw_key, key_hash = generate_api_key()
    db.add(DeviceCredential(device_id=device.id, key_hash=key_hash))
    db.commit()
    return RotatedKey(device_id=device.id, api_key=raw_key, rotated_at=now)