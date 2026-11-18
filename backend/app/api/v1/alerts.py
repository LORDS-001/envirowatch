from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Alert, AlertRule, NotificationAttempt, User
from app.schemas.alert import (
    AlertOut, AlertPage, AlertRuleOut, AlertRulePage, AlertRulePatch, NotificationAttemptOut,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])
rules_router = APIRouter(prefix="/alert-rules", tags=["alert-rules"])

STATUSES = {"pending", "active", "acknowledged", "resolved"}


def _serialize(db: Session, alerts: list[Alert]) -> list[AlertOut]:
    by_alert = defaultdict(list)
    if alerts:
        attempts = db.scalars(
            select(NotificationAttempt)
            .where(NotificationAttempt.alert_id.in_([a.id for a in alerts]))
            .order_by(NotificationAttempt.id)
        )
        for n in attempts:
            by_alert[n.alert_id].append(
                NotificationAttemptOut(
                    alert_id=n.alert_id, channel=n.channel, outcome=n.outcome, attempted_at=n.attempted_at
                )
            )
    return [
        AlertOut(
            id=a.id, kind=a.kind, metric=a.metric, site_id=a.site_id, device_id=a.device_id,
            title=a.title, status=a.status, threshold=a.threshold, hysteresis=a.hysteresis,
            value=a.value, opened_at=a.opened_at, activated_at=a.activated_at,
            acknowledged_at=a.acknowledged_at, resolved_at=a.resolved_at,
            corroborating_devices=a.corroborating_devices, notifications=by_alert[a.id],
        )
        for a in alerts
    ]


def _get_alert(db: Session, alert_id: str, user: User) -> Alert:
    alert = db.scalar(select(Alert).where(Alert.id == alert_id, Alert.organization_id == user.organization_id))
    if alert is None:
        raise HTTPException(404, detail="Alert not found")
    return alert


@router.get("", response_model=AlertPage)
def list_alerts(
    status: list[str] = Query(default=[]),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bad = [s for s in status if s not in STATUSES]
    if bad:
        raise HTTPException(422, detail=f"Unknown status: {', '.join(bad)}")
    q = select(Alert).where(Alert.organization_id == user.organization_id)
    if status:
        q = q.where(Alert.status.in_(status))
    alerts = list(db.scalars(q.order_by(Alert.opened_at.desc()).limit(limit)))
    return AlertPage(items=_serialize(db, alerts), next_cursor=None)


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _serialize(db, [_get_alert(db, alert_id, user)])[0]


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    alert = _get_alert(db, alert_id, user)
    if alert.status == "resolved":
        raise HTTPException(409, detail="This alert has already resolved")
    if alert.status in ("pending", "active"):
        alert.status = "acknowledged"
        alert.acknowledged_at = datetime.now(timezone.utc)
        db.commit()
    return _serialize(db, [alert])[0]


@rules_router.get("", response_model=AlertRulePage)
def list_rules(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rules = db.scalars(
        select(AlertRule).where(AlertRule.organization_id == admin.organization_id).order_by(AlertRule.id)
    )
    return AlertRulePage(items=[AlertRuleOut.model_validate(r) for r in rules], next_cursor=None)


@rules_router.patch("/{rule_id}", response_model=AlertRuleOut)
def update_rule(
    rule_id: str, body: AlertRulePatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    rule = db.scalar(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.organization_id == admin.organization_id)
    )
    if rule is None:
        raise HTTPException(404, detail="Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule