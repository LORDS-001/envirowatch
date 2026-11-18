from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Alert, AlertRule, Device, Measurement, NotificationAttempt, Organization, Site
from app.services.health import evaluate

MIN_CORROBORATION = 2
OPEN = ("pending", "active", "acknowledged")


def run_cycle(db: Session, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    for org_id in list(db.scalars(select(Organization.id))):
        _environment_alerts(db, org_id, now)
        _device_alerts(db, org_id, now)
    db.commit()


def _notify(db: Session, alert: Alert, channels: list[str], now: datetime) -> None:
    for ch in channels:  # sandbox: record the attempt, send nothing
        db.add(NotificationAttempt(alert_id=alert.id, channel=ch, outcome="delivered", attempted_at=now))


def _site_buckets(db, org_id, rule, now, minutes):
    bucket = func.date_trunc("minute", Measurement.event_time).label("b")
    rows = db.execute(
        select(
            Device.site_id,
            bucket,
            func.percentile_cont(0.5).within_group(Measurement.value),
            func.count(func.distinct(Measurement.device_id)).filter(Measurement.value > rule.threshold),
        )
        .select_from(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == org_id,
            Measurement.metric == rule.metric,
            Measurement.event_time > now - timedelta(minutes=minutes + 1),
            Measurement.event_time <= now + timedelta(minutes=1),
            Measurement.quality_status.in_(["valid", "estimated"]),
        )
        .group_by(Device.site_id, bucket)
        .order_by(Device.site_id, bucket)
    ).all()
    out = defaultdict(list)
    for site_id, b, avg, above in rows:
        out[site_id].append((b, float(avg), above))
    return out


def _environment_alerts(db: Session, org_id, now: datetime) -> None:
    rules = db.scalars(
        select(AlertRule).where(
            AlertRule.organization_id == org_id, AlertRule.enabled.is_(True), AlertRule.kind == "threshold"
        )
    )
    for rule in rules:
        n = rule.consecutive_readings
        buckets = _site_buckets(db, org_id, rule, now, n)
        sites = {s.id: s for s in db.scalars(select(Site).where(Site.organization_id == org_id))}
        open_alerts = {
            a.fingerprint: a
            for a in db.scalars(select(Alert).where(Alert.rule_id == rule.id, Alert.status.in_(OPEN)))
        }

        for site_id, series in buckets.items():
            fp = f"env:{rule.id}:{site_id}"
            _b, latest, above = series[-1]
            existing = open_alerts.get(fp)
            sustained = len(series) >= n and all(avg > rule.threshold for _, avg, _ in series[-n:])

            if existing is None:
                if latest > rule.threshold and above >= MIN_CORROBORATION:
                    cooling = db.scalar(
                        select(Alert.id).where(
                            Alert.fingerprint == fp,
                            Alert.resolved_at > now - timedelta(minutes=rule.cooldown_min),
                        )
                    )
                    if cooling:
                        continue
                    alert = Alert(
                        organization_id=org_id, rule_id=rule.id, fingerprint=fp, kind="environment",
                        metric=rule.metric, site_id=site_id,
                        title=f"{rule.name}: {sites[site_id].name}",
                        status="active" if sustained else "pending",
                        threshold=rule.threshold, hysteresis=rule.hysteresis, value=latest,
                        corroborating_devices=above, opened_at=now,
                        activated_at=now if sustained else None,
                    )
                    db.add(alert)
                    db.flush()
                    if sustained:
                        _notify(db, alert, rule.channels, now)
                continue

            existing.value = latest
            existing.corroborating_devices = above
            if existing.status == "pending":
                if sustained and above >= MIN_CORROBORATION:
                    existing.status, existing.activated_at = "active", now
                    _notify(db, existing, rule.channels, now)
                elif latest <= rule.threshold or above < MIN_CORROBORATION:
                    db.delete(existing)  # never became real: drop it
            elif latest < rule.threshold - rule.hysteresis:
                existing.status, existing.resolved_at = "resolved", now
        for fp, stale in open_alerts.items():
                if stale.site_id not in buckets:  # the site stopped reporting
                    if stale.status == "pending":
                        db.delete(stale)
                    else:
                        stale.status, stale.resolved_at = "resolved", now

def _device_alerts(db: Session, org_id, now: datetime) -> None:
    flagged = {}
    for r in evaluate(db, org_id, now):
        if r.health in ("silent", "drifting"):
            fault = "silent" if r.health == "silent" else "drift"
            detail = next((e.detail for e in r.events if e.fault_type == fault), None)
            flagged[f"dev:{r.device.id}:{fault}"] = (r.device, fault, detail)

    open_alerts = {
        a.fingerprint: a
        for a in db.scalars(
            select(Alert).where(
                Alert.organization_id == org_id, Alert.kind == "device", Alert.status.in_(OPEN)
            )
        )
    }
    for fp, alert in open_alerts.items():
        if fp not in flagged:
            alert.status, alert.resolved_at = "resolved", now
    for fp, (device, fault, detail) in flagged.items():
        if fp in open_alerts:
            continue
        title = f"{device.id} has gone silent" if fault == "silent" else f"{device.id} is drifting"
        alert = Alert(
            organization_id=org_id, fingerprint=fp, kind="device", site_id=device.site_id,
            device_id=device.id, title=title if not detail else f"{title} ({detail})",
            status="active", opened_at=now, activated_at=now,
        )
        db.add(alert)
        db.flush()
        _notify(db, alert, ["email"], now)