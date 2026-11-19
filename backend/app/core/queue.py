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