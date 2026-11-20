import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.queue import LIVE_CHANNEL

log = logging.getLogger("live")

ALLOWED_ORIGINS = ["http://localhost:5173"]  # the frontend; used for CORS and the websocket Origin check


class Hub:
    """Fans events out to connected sockets, grouped by organization."""

    def __init__(self) -> None:
        self.clients: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def add(self, org: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self.clients[org].add(q)
        return q

    def remove(self, org: str, q: asyncio.Queue) -> None:
        self.clients[org].discard(q)

    def dispatch(self, org: str, text: str) -> None:
        for q in self.clients.get(org, ()):
            try:
                q.put_nowait(text)
            except asyncio.QueueFull:
                pass  # a very slow client; the dashboard refetches when it reconnects

    async def heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            text = json.dumps({
                "type": "heartbeat",
                "data": {"server_time": datetime.now(timezone.utc).isoformat()},
            })
            for queues in self.clients.values():
                for q in queues:
                    try:
                        q.put_nowait(text)
                    except asyncio.QueueFull:
                        pass


async def subscriber(hub: Hub) -> None:
    while True:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        try:
            pubsub = r.pubsub()
            await pubsub.subscribe(LIVE_CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    env = json.loads(msg["data"])
                    hub.dispatch(env["org"], json.dumps({"type": env["type"], "data": env["data"]}))
                except (ValueError, KeyError):
                    log.warning("dropped a malformed live event")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("live subscriber lost its connection; retrying")
            await asyncio.sleep(2)
        finally:
            try:
                await r.aclose()
            except Exception:
                pass