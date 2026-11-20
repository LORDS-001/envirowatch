import json
import logging

import redis

from app.core.queue import LIVE_CHANNEL, get_redis

log = logging.getLogger("faults")
ANNOUNCE_ONCE_FOR_S = 3600  


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