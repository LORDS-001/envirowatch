import time
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.security import hash_token
from app.db.session import SessionLocal
from app.models import Device, DeviceCredential

TTL = 30.0           
NEGATIVE_TTL = 10.0


@dataclass(frozen=True)
class DeviceInfo:
    id: str
    status: str


_cache: dict[str, tuple[float, DeviceInfo | None]] = {}


def _lookup(key_hash: str) -> DeviceInfo | None:
    with SessionLocal() as db:
        cred = db.scalar(
            select(DeviceCredential).where(
                DeviceCredential.key_hash == key_hash, DeviceCredential.revoked_at.is_(None)
            )
        )
        if cred is None:
            return None
        device = db.get(Device, cred.device_id)
        return DeviceInfo(device.id, device.status) if device else None


def authenticate(api_key: str | None) -> DeviceInfo:
    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API key")
    key_hash = hash_token(api_key)
    now = time.monotonic()
    hit = _cache.get(key_hash)
    if hit and hit[0] > now:
        info = hit[1]
    else:
        info = _lookup(key_hash)
        if len(_cache) > 10_000:
            _cache.clear()
        _cache[key_hash] = (now + (TTL if info else NEGATIVE_TTL), info)
    if info is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")
    if info.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Device is deactivated")
    return info