from datetime import datetime, timedelta, timezone
import secrets
import jwt
import hashlib
from app.core.config import settings
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False



DUMMY_HASH = _hasher.hash("not-a-real-password")

def create_access_token(user_id, organization_id, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "org": str(organization_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def generate_api_key() -> tuple[str, str]:
    raw = "ewk_" + secrets.token_urlsafe(32)
    return raw, hash_token(raw)