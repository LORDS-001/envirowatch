import json
import logging
import os
import time
from datetime import datetime, timezone

import redis
from sqlalchemy.exc import OperationalError

from app.core.queue import DEAD, GROUP, LATENCY_KEY, STREAM, make_redis
from app.db.session import SessionLocal
from app.services.ingestion import Item, process_batch

log = logging.getLogger("ingest-worker")

BATCH = 200
CONSUMER = os.environ.get("WORKER_NAME", "worker-1")  
CLAIM_IDLE_MS = 30_000
CLAIM_EVERY_S = 10


def ensure_group(r: redis.Redis) -> None:
    try:
        r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


def parse(entries):
    items, ids, bad = [], [], []
    for msg_id, fields in entries:
        try:
            payload = json.loads(fields["payload"])
            if not isinstance(payload, dict):
                raise ValueError("payload is not an object")
            items.append(Item(
                device_id=fields["device_id"], payload=payload,
                received_at=datetime.fromisoformat(fields["received_at"]),
            ))
            ids.append(msg_id)
        except (KeyError, ValueError, TypeError):
            bad.append(msg_id)
    return items, ids, bad


def write(items: list[Item]) -> None:
    with SessionLocal() as db:
        process_batch(db, items)


def record_latency(r: redis.Redis, items: list[Item]) -> None:
    now = datetime.now(timezone.utc)
    values = [max(0, int((now - i.received_at).total_seconds() * 1000)) for i in items]
    pipe = r.pipeline()
    pipe.lpush(LATENCY_KEY, *values)
    pipe.ltrim(LATENCY_KEY, 0, 4999)
    pipe.execute()


def handle(r: redis.Redis, entries) -> int:
    fields_by_id = dict(entries)
    items, ids, bad = parse(entries)
    done: list[str] = []

    for msg_id in bad:
        r.xadd(DEAD, {**fields_by_id[msg_id], "error": "malformed", "orig_id": msg_id})
        done.append(msg_id)

    if items:
        try:
            write(items)
            done += ids
            record_latency(r, items)
        except OperationalError:
            log.exception("database unavailable; messages stay queued and will be retried")
            time.sleep(2)
        except Exception:
            log.exception("batch failed; retrying one by one")
            for msg_id, item in zip(ids, items):
                try:
                    write([item])
                    done.append(msg_id)
                    record_latency(r, [item])
                except OperationalError:
                    time.sleep(2)
                    break
                except Exception as e:
                    log.exception("poison message %s moved to the dead-letter stream", msg_id)
                    r.xadd(DEAD, {**fields_by_id[msg_id], "error": str(e)[:300], "orig_id": msg_id})
                    done.append(msg_id)

    if done:
        r.xack(STREAM, GROUP, *done)
        r.xdel(STREAM, *done)  # stored, so the stream length equals the queue depth
    return len(done)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
    r = make_redis(timeout=15)
    ensure_group(r)
    log.info("worker %s started (batch size %d)", CONSUMER, BATCH)

    last_claim = last_log = time.monotonic()
    processed = 0
    while True:
        try:
            if time.monotonic() - last_claim > CLAIM_EVERY_S:
                last_claim = time.monotonic()
                claimed = r.xautoclaim(
                    STREAM, GROUP, CONSUMER, min_idle_time=CLAIM_IDLE_MS, start_id="0-0", count=BATCH
                )[1]
                if claimed:
                    log.warning("reclaimed %d messages left by a stopped worker", len(claimed))
                    processed += handle(r, claimed)

            for start in ("0", ">"):  # "0": my own unfinished messages, ">": new ones
                resp = r.xreadgroup(
                    GROUP, CONSUMER, {STREAM: start}, count=BATCH, block=1000 if start == ">" else None
                )
                entries = resp[0][1] if resp else []
                if entries:
                    processed += handle(r, entries)

            now = time.monotonic()
            if now - last_log >= 5:
                if processed:
                    log.info("stored %d messages (%.0f/s), queue depth %d",
                             processed, processed / (now - last_log), r.xlen(STREAM))
                processed, last_log = 0, now
        except (redis.ConnectionError, redis.TimeoutError):
            log.warning("redis unavailable, retrying")
            time.sleep(2)
        except redis.ResponseError as e:
            if "NOGROUP" not in str(e):
                raise
            ensure_group(r)
        except KeyboardInterrupt:
            log.info("stopping")
            break


if __name__ == "__main__":
    main()