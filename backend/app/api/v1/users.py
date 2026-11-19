import logging
import re
import secrets
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models import Organization, User
from app.schemas.auth import OrganizationOut, UserOut

log = logging.getLogger("users")
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


class OrgPatch(BaseModel):
    name: str


@router.get("", response_model=UserPage)
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.scalars(
        select(User).where(User.organization_id == admin.organization_id).order_by(User.email)
    )
    return UserPage(items=[UserOut.model_validate(u) for u in users])


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    email = body.email.strip().lower()
    if len(email) > 320 or not EMAIL.match(email):
        raise HTTPException(422, detail="Enter a valid email address")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(409, detail="That email already has an account")

    password = body.password or secrets.token_urlsafe(9)
    user = User(
        organization_id=admin.organization_id,
        email=email,
        password_hash=hash_password(password),
        role=body.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, detail="That email already has an account")
    db.refresh(user)
    if body.password is None:
        log.warning("SANDBOX INVITE to %s: temporary password %s", email, password)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, body: UserPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
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