import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import DUMMY_HASH, create_access_token, hash_token, verify_password, hash_password
from app.db.session import get_db
from app.models import Organization, RefreshToken, User, UserInvitation
from app.schemas.auth import LoginRequest, LoginResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


class AcceptInvitation(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    password: str = Field(min_length=10, max_length=128)


@router.post("/accept-invitation", status_code=204)
def accept_invitation(body: AcceptInvitation, db: Session = Depends(get_db)):
    row = db.scalar(select(UserInvitation).where(UserInvitation.token_hash == hash_token("invitation:" + body.token)).with_for_update())
    now = datetime.now(timezone.utc)
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise HTTPException(400, detail="This invitation is invalid or expired. Ask your administrator for access.")
    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(400, detail="This invitation is invalid or expired")
    user.password_hash = hash_password(body.password)
    row.used_at = now
    db.commit()
    return Response(status_code=204)

COOKIE_NAME = "refresh_token"
COOKIE_PATH = "/api/v1/auth"  

def _issue_refresh_cookie(response: Response, db: Session, user: User) -> None:
    raw = secrets.token_urlsafe(48)
    lifetime = timedelta(days=settings.refresh_token_expire_days)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(timezone.utc) + lifetime,
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        raw,
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )


def _login_response(db: Session, user: User) -> LoginResponse:
    org = db.get(Organization, user.organization_id)
    token = create_access_token(user.id, user.organization_id, user.role)
    return LoginResponse(access_token=token, user=user, organization=org)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))

    password_ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    _issue_refresh_cookie(response, db, user)
    return _login_response(db, user)


@router.post("/refresh", response_model=LoginResponse)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None),
):
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No session")

    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token)).with_for_update())
    now = datetime.now(timezone.utc)
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    row.revoked_at = now  # rotation: each refresh token works once
    _issue_refresh_cookie(response, db, user)  # also commits the revoke
    return _login_response(db, user)


@router.post("/logout", status_code=204)
def logout(db: Session = Depends(get_db), refresh_token: str | None = Cookie(default=None)):
    if refresh_token:
        row = db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
        )
        if row is not None and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            db.commit()
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)
    return resp


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
