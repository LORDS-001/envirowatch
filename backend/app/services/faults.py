import json
import logging

import redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.queue import LIVE_CHANNEL, get_redis
from app.models import Alert

log = logging.getLogger("live-events")

ANNOUNCE_ONCE_FOR_S = 3600  # the frontend's fault list does not de-duplicate
STATUS_KEY = "health:status"


def publish_new_faults(org_id, results) -> None:
    try:
        r = get_redis()
        for res in results:
            for e in res.events:
                if not r.set(f"fault:{e.device_id}:{e.fault_type}", "1", nx=True, ex=ANNOUNCE_ONCE_FOR_S):
                    continue  # already announced
                r.publish(LIVE_CHANNEL, json.dumps({
                    "org": str(org_id),
                    "type": "sensor.fault_detected",
                    "data": {
                        "device_id": e.device_id,
                        "fault_type": e.fault_type,
                        "severity": e.severity,
                        "detected_at": e.detected_at.isoformat(),
                    },
                }))
    except redis.RedisError:
        log.warning("could not publish fault events")


def publish_status_changes(org_id, results) -> None:
    try:
        r = get_redis()
        status_key = f"{STATUS_KEY}:{org_id}"
        previous = r.hgetall(status_key)
        current = {res.device.id: res.health for res in results}
        if current and not previous:
            r.hset(status_key, mapping=current)
        if not previous:  # first cycle: record the baseline and announce nothing
            return
        pipe = r.pipeline()
        for res in results:
            if previous.get(res.device.id, res.health) == res.health:
                continue
            seen = res.device.last_seen_at
            pipe.publish(LIVE_CHANNEL, json.dumps({
                "org": str(org_id),
                "type": "device.status_changed",
                "data": {
                    "device_id": res.device.id,
                    "status": res.health,
                    "last_seen_at": seen.isoformat() if seen else None,
                },
            }))
        if current:
            pipe.hset(status_key, mapping=current)
        if current:
            pipe.execute()
    except redis.RedisError:
        log.warning("could not publish device status events")


def publish_alert_events(db: Session, before: dict[str, str]) -> None:
    from app.api.v1.alerts import _serialize  # imported here to avoid a circular import

    opened = [
        a for a in db.scalars(select(Alert).where(Alert.status.in_(("active", "acknowledged"))))
        if before.get(a.id) in (None, "pending")
    ]
    resolved = []
    if before:
        resolved = list(
            db.scalars(select(Alert).where(Alert.id.in_(list(before)), Alert.status == "resolved"))
        )
    if not opened and not resolved:
        return
    try:
        pipe = get_redis().pipeline()
        for event_type, alerts in (("alert.created", opened), ("alert.resolved", resolved)):
            for alert, out in zip(alerts, _serialize(db, alerts)):
                pipe.publish(LIVE_CHANNEL, json.dumps({
                    "org": str(alert.organization_id),
                    "type": event_type,
                    "data": out.model_dump(mode="json"),
                }))
        pipe.execute()
    except redis.RedisError:
        log.warning("could not publish alert events")
