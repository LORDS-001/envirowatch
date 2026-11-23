from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, literal_column, case
from sqlalchemy.orm import Session

from app.models import Alert, AlertRule, Device, Measurement, NotificationAttempt, Organization, Site, SimulationRun
from app.services.faults import publish_alert_events, publish_new_faults, publish_status_changes
from app.services.health import evaluate
from app.services.notifications import email_configured

MIN_CORROBORATION = 2
OPEN = ("pending", "active", "acknowledged")


def run_cycle(db: Session, now: datetime | None = None) -> None:
    if not db.scalar(select(func.pg_try_advisory_xact_lock(384657201))):
        db.rollback()
        return
    now = now or datetime.now(timezone.utc)
    before = dict(db.execute(select(Alert.id, Alert.status).where(Alert.status.in_(OPEN))).all())
    for org_id in list(db.scalars(select(Organization.id).where(Organization.id.notin_(select(SimulationRun.sandbox_id))))):
        _environment_alerts(db, org_id, now)
        _device_alerts(db, org_id, now)
    db.commit()
    publish_alert_events(db, before)


def _notify(db: Session, alert: Alert, channels: list[str], now: datetime) -> None:
    for ch in channels:
        configured = ch == "email" and email_configured(alert.organization_id)
        db.add(NotificationAttempt(alert_id=alert.id, channel=ch, outcome="pending" if configured else "not_configured", attempted_at=now))


def _site_buckets(db, org_id, rule, now, readings, threshold=None):
    bucket = func.date_bin(literal_column("interval '10 seconds'"), Measurement.event_time,
                           literal_column("timestamptz '2000-01-01 00:00:00+00'")).label("b")
    rows = db.execute(
        select(
            Device.site_id,
            bucket,
            func.percentile_cont(0.5).within_group(Measurement.value),
            func.count(func.distinct(Measurement.device_id)).filter(Measurement.value > (rule.threshold if threshold is None else threshold)),
        )
        .select_from(Measurement)
        .join(Device, Measurement.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Site.organization_id == org_id,
            Measurement.metric == rule.metric,
            Measurement.event_time > now - timedelta(seconds=(readings + 2) * 10),
            Measurement.event_time <= now,
            Device.status == "active",
            Measurement.quality_status.in_(["valid", "estimated"]),
        )
        .group_by(Device.site_id, bucket)
        .order_by(Device.site_id, bucket)
    ).all()
    out = defaultdict(list)
    for site_id, b, value, above in rows:
        out[site_id].append((b, float(value), above))
    return out


def _environment_alerts(db: Session, org_id, now: datetime) -> None:
    rules = db.scalars(
        select(AlertRule).where(
            AlertRule.organization_id == org_id, AlertRule.enabled.is_(True)
        )
    )
    for rule in rules:
        n = rule.consecutive_readings
        buckets = _site_buckets(db, org_id, rule, now, n)
        thresholds = {}
        hystereses = {}
        if rule.kind == "unusual_change":
            baselines = db.execute(
                select(Device.site_id, func.percentile_cont(0.5).within_group(Measurement.value))
                .join(Measurement, Measurement.device_id == Device.id)
                .join(Site, Site.id == Device.site_id)
                .where(Site.organization_id == org_id, Device.status == "active", Measurement.metric == rule.metric,
                       Measurement.quality_status.in_(["valid", "estimated"]),
                       Measurement.event_time >= now - timedelta(hours=1),
                       Measurement.event_time < now - timedelta(seconds=(n + 2) * 10))
                .group_by(Device.site_id)
                .having(func.count() >= 10)
            ).all()
            thresholds = {site_id: float(value) + abs(float(value)) * rule.threshold / 100 for site_id, value in baselines if abs(value) > 0.01}
            hystereses = {site_id: abs(float(value)) * rule.hysteresis / 100 for site_id, value in baselines}
            buckets = _site_buckets(db, org_id, rule, now, n, case(thresholds, value=Device.site_id, else_=float("inf"))) if thresholds else {}
            buckets = {site_id: series for site_id, series in buckets.items() if site_id in thresholds}
        sites = {s.id: s for s in db.scalars(select(Site).where(Site.organization_id == org_id))}
        open_alerts = {
            a.fingerprint: a
            for a in db.scalars(select(Alert).where(Alert.rule_id == rule.id, Alert.status.in_(OPEN)))
        }

        for site_id, series in buckets.items():
            threshold = thresholds.get(site_id, rule.threshold)
            hysteresis = hystereses.get(site_id, rule.hysteresis)
            fp = f"env:{rule.id}:{site_id}"
            _b, latest, above = series[-1]
            if now - _b > timedelta(seconds=30):
                continue
            existing = open_alerts.get(fp)
            recent = series[-n:]
            sustained = (len(recent) == n and now - recent[-1][0] <= timedelta(seconds=30)
                         and all(value > threshold and count >= MIN_CORROBORATION for _, value, count in recent)
                         and all(right[0] - left[0] == timedelta(seconds=10) for left, right in zip(recent, recent[1:])))

            if existing is None:
                if latest > threshold and above >= MIN_CORROBORATION:
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
                        threshold=threshold, hysteresis=hysteresis, value=latest,
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
                existing.threshold, existing.hysteresis = threshold, hysteresis
                if sustained and above >= MIN_CORROBORATION:
                    existing.status, existing.activated_at = "active", now
                    _notify(db, existing, rule.channels, now)
                elif latest <= threshold or above < MIN_CORROBORATION:
                    db.delete(existing)  # never became real: drop it
            elif latest < existing.threshold - (existing.hysteresis or 0):
                existing.status, existing.resolved_at = "resolved", now

        for fp, stale in open_alerts.items():
            if stale.site_id not in buckets:  # the site stopped reporting
                if stale.status == "pending":
                    db.delete(stale)


def _device_alerts(db: Session, org_id, now: datetime) -> None:
    results = evaluate(db, org_id, now)
    publish_new_faults(org_id, results)
    publish_status_changes(org_id, results)

    flagged = {}
    for r in results:
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
