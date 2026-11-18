import asyncio
import logging

from app.db.session import SessionLocal
from app.services.alerts import run_cycle

log = logging.getLogger("alerts")


def _once() -> None:
    with SessionLocal() as db:
        run_cycle(db)


async def alert_loop(interval_s: int = 15) -> None:
    while True:
        try:
            await asyncio.to_thread(_once)
        except Exception:
            log.exception("alert cycle failed")
        await asyncio.sleep(interval_s)