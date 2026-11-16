import uuid
from sqlalchemy import select
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from fastapi import Header
from app.core.security import hash_token
from app.models import Device, DeviceCredential
from app.models.device import DeviceCredential


bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise _UNAUTHORIZED
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise _UNAUTHORIZED
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise _UNAUTHORIZED
    user = db.get(User, user_id)
    if user is None:
        raise _UNAUTHORIZED
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def authenticate_device( db: Session,x_api_key: str | None) -> Device:
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API key")
    cred = db.scalar(
        select(DeviceCredential).where(
            DeviceCredential.key_hash == hash_token(x_api_key),
            DeviceCredential.revoked_at.is_(None),
        )
    )
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")
    device = db.get(Device, cred.device_id)
    if device is None or device.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Device is deactivated")
    return device