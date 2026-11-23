from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.security import hash_token
from app.db.session import SessionLocal
from app.models import Device, DeviceCredential

@dataclass(frozen=True)
class DeviceInfo:
    id: str
    status: str


def _lookup(key_hash: str) -> DeviceInfo | None:
    with SessionLocal() as db:
        row = db.execute(
            select(Device.id, Device.status)
            .join(DeviceCredential, DeviceCredential.device_id == Device.id)
            .where(
                DeviceCredential.key_hash == key_hash, DeviceCredential.revoked_at.is_(None)
            )
        ).first()
        return DeviceInfo(row[0], row[1]) if row else None


def authenticate(api_key: str | None) -> DeviceInfo:
    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API key")
    key_hash = hash_token(api_key)
    info = _lookup(key_hash)
    if info is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")
    if info.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Device is deactivated")
    return info
