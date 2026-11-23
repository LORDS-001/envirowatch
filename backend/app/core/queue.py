from functools import lru_cache

import redis

from app.core.config import settings

STREAM = "ingest:readings"
GROUP = "ingest-workers"
DEAD = "ingest:dead"
LATENCY_KEY = "ingest:latency_ms"


def make_redis(timeout: float | None = 2.0) -> redis.Redis:
    return redis.Redis.from_url(
        settings.redis_url, decode_responses=True, socket_timeout=timeout, socket_connect_timeout=2.0
    )


@lru_cache
def get_redis() -> redis.Redis:
    return make_redis()


LIVE_CHANNEL = "live:events"

ENQUEUE = """
if redis.call('XLEN', KEYS[1]) >= tonumber(ARGV[1]) then
    return false
end
return redis.call('XADD', KEYS[1], '*', 'device_id', ARGV[2], 'received_at', ARGV[3], 'payload', ARGV[4])
"""

ACK_DELETE = """
redis.call('XPENDING', KEYS[1], ARGV[1], '-', '+', 1)
local acknowledged = 0
for index = 2, #ARGV do
    if redis.call('XACK', KEYS[1], ARGV[1], ARGV[index]) == 1 then
        redis.call('XDEL', KEYS[1], ARGV[index])
        acknowledged = acknowledged + 1
    end
end
return acknowledged
"""
