import re
import secrets
import uuid
from typing import Literal
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.security import hash_password, hash_token
from app.db.session import get_db
from app.models import Organization, User, UserInvitation
from app.schemas.auth import OrganizationOut, UserOut
from app.services.notifications import deliver_invitation

router = APIRouter(prefix="/users", tags=["users"])
org_router = APIRouter(prefix="/organization", tags=["organization"])

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserPage(BaseModel):
    items: list[UserOut]
    next_cursor: str | None = None


class UserCreate(BaseModel):
    email: str
    role: Literal["admin", "operator"] = "operator"
    password: str | None = Field(default=None, min_length=10, max_length=128)


class UserPatch(BaseModel):
    role: Literal["admin", "operator"]


class InvitedUserOut(UserOut):
    invitation_token: str | None = None
    invitation_delivery: Literal["delivered", "failed", "not_configured"] | None = None


class OrgPatch(BaseModel):
    name: str


@router.get("", response_model=UserPage)
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = list(db.scalars(
        select(User).where(User.organization_id == admin.organization_id).order_by(User.email)
    ))
    pending = set(db.scalars(select(UserInvitation.user_id).where(UserInvitation.user_id.in_([user.id for user in users]), UserInvitation.used_at.is_(None))))
    return UserPage(items=[UserOut.model_validate(user).model_copy(update={"invitation_pending": user.id in pending}) for user in users])


@router.post("", response_model=InvitedUserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    email = body.email.strip().lower()
    if len(email) > 320 or not EMAIL.match(email):
        raise HTTPException(422, detail="Enter a valid email address")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(409, detail="That email already has an account")

    password = body.password or secrets.token_urlsafe(48)
    user = User(
        organization_id=admin.organization_id,
        email=email,
        password_hash=hash_password(password),
        role=body.role,
    )
    db.add(user)
    invitation = None
    try:
        db.flush()
        if body.password is None:
            invitation = secrets.token_urlsafe(48)
            db.add(UserInvitation(user_id=user.id, token_hash=hash_token("invitation:" + invitation), expires_at=datetime.now(timezone.utc) + timedelta(hours=24)))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, detail="That email already has an account")
    db.refresh(user)
    result = UserOut.model_validate(user).model_dump()
    result["invitation_pending"] = invitation is not None
    delivery = deliver_invitation(user.email, invitation) if invitation else None
    return InvitedUserOut(**result, invitation_token=invitation, invitation_delivery=delivery)


@router.post("/{user_id}/invitation", response_model=InvitedUserOut)
def reissue_invitation(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.scalar(select(User).where(User.id == user_id, User.organization_id == admin.organization_id))
    if user is None:
        raise HTTPException(404, detail="User not found")
    invitation = db.scalar(select(UserInvitation).where(UserInvitation.user_id == user.id).with_for_update())
    if invitation is None or invitation.used_at is not None:
        raise HTTPException(409, detail="This account has already completed setup")
    raw = secrets.token_urlsafe(48)
    invitation.token_hash = hash_token("invitation:" + raw)
    invitation.expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    db.commit()
    result = UserOut.model_validate(user).model_dump()
    result["invitation_pending"] = True
    return InvitedUserOut(**result, invitation_token=raw, invitation_delivery=deliver_invitation(user.email, raw))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, body: UserPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    db.get(Organization, admin.organization_id, with_for_update=True)
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(404, detail="User not found")
    user = db.scalar(select(User).where(User.id == uid, User.organization_id == admin.organization_id))
    if user is None:
        raise HTTPException(404, detail="User not found")

    if user.role == "admin" and body.role != "admin":
        admins = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.organization_id == admin.organization_id, User.role == "admin")
        )
        if admins <= 1:
            raise HTTPException(409, detail="An organization needs at least one administrator")

    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


@org_router.patch("", response_model=OrganizationOut)
def rename_organization(body: OrgPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, detail="Enter an organization name")
    if len(name) > 200:
        raise HTTPException(422, detail="That name is too long")
    org = db.get(Organization, admin.organization_id)
    org.name = name
    db.commit()
    db.refresh(org)
    return org
