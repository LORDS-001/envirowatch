from contextlib import contextmanager
from datetime import datetime, timezone
import json
from types import SimpleNamespace
import uuid

import pytest
import redis
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.core.queue import ACK_DELETE, get_redis
from app.models import Device, Measurement
from app.workers import ingest_worker


@pytest.fixture
def worker_queue(monkeypatch):
    connection = get_redis()
    try:
        connection.ping()
    except redis.RedisError:
        pytest.skip("Redis unavailable: worker recovery integration could not run")
    namespace = f"envirowatch:test:{uuid.uuid4().hex}"
    for attribute, suffix in (("STREAM", "readings"), ("DEAD", "dead"), ("LATENCY_KEY", "latency"), ("LIVE_CHANNEL", "live")):
        monkeypatch.setattr(ingest_worker, attribute, f"{namespace}:{suffix}")
    monkeypatch.setattr(ingest_worker, "GROUP", namespace)
    monkeypatch.setattr(ingest_worker, "CONSUMER", "surviving-worker")
    monkeypatch.setattr(ingest_worker, "CLAIM_IDLE_MS", 0)
    monkeypatch.setattr(ingest_worker, "ORG_CACHE", {})
    ingest_worker.ensure_group(connection)
    try:
        yield connection
    finally:
        connection.delete(ingest_worker.STREAM, ingest_worker.DEAD, ingest_worker.LATENCY_KEY)


@pytest.fixture
def queued_reading(worker_queue, db, tenant, monkeypatch):
    device = Device(id=f"recovery-{uuid.uuid4().hex[:12]}", site_id=tenant[1].id, type="sensor", metrics=["pm25"])
    db.add(device)
    db.flush()

    @contextmanager
    def session():
        yield db

    monkeypatch.setattr(ingest_worker, "SessionLocal", session)
    now = datetime.now(timezone.utc).isoformat()
    worker_queue.xadd(ingest_worker.STREAM, {"device_id": device.id, "received_at": now, "payload": json.dumps({"reading_id": "recovery-reading", "timestamp": now, "measurements": {"pm25": 25}})})
    entries = worker_queue.xreadgroup(ingest_worker.GROUP, "stopped-worker", {ingest_worker.STREAM: ">"})[0][1]
    return worker_queue, entries


def test_stopped_worker_messages_are_reclaimed_and_stored(queued_reading, db):
    connection, _ = queued_reading
    _, processed = ingest_worker.reclaim(connection, "0-0")
    assert processed == 1
    assert db.scalar(select(func.count()).select_from(Measurement)) == 1
    assert connection.xlen(ingest_worker.STREAM) == 0
    assert connection.xpending(ingest_worker.STREAM, ingest_worker.GROUP)["pending"] == 0


def test_ack_failure_after_commit_replays_without_duplicate_measurements(queued_reading, db, monkeypatch):
    connection, entries = queued_reading
    original_eval = connection.eval

    def disconnected(script, *args):
        if script == ACK_DELETE:
            raise redis.ConnectionError("Lost before acknowledgement")
        return original_eval(script, *args)

    monkeypatch.setattr(connection, "eval", disconnected)
    with pytest.raises(redis.ConnectionError):
        ingest_worker.handle(connection, entries)
    assert db.scalar(select(func.count()).select_from(Measurement)) == 1
    assert connection.xpending(ingest_worker.STREAM, ingest_worker.GROUP)["pending"] == 1
    monkeypatch.setattr(connection, "eval", original_eval)
    assert ingest_worker.handle(connection, entries) == 1
    assert db.scalar(select(func.count()).select_from(Measurement)) == 1
    assert connection.xlen(ingest_worker.STREAM) == 0


def test_database_outage_keeps_pending_work_for_recovery(queued_reading, monkeypatch):
    connection, entries = queued_reading
    write = ingest_worker.write

    def unavailable(items):
        raise OperationalError("test", {}, Exception("Database unavailable"))

    monkeypatch.setattr(ingest_worker, "write", unavailable)
    assert ingest_worker.handle(connection, entries) == 0
    assert connection.xlen(ingest_worker.STREAM) == 1
    assert connection.xpending(ingest_worker.STREAM, ingest_worker.GROUP)["pending"] == 1
    monkeypatch.setattr(ingest_worker, "write", write)
    assert ingest_worker.handle(connection, entries) == 1
    assert connection.xlen(ingest_worker.STREAM) == 0


def test_missing_group_does_not_delete_accepted_work(worker_queue):
    message_id = worker_queue.xadd(ingest_worker.STREAM, {"payload": "{}"})
    worker_queue.xgroup_destroy(ingest_worker.STREAM, ingest_worker.GROUP)
    with pytest.raises(redis.ResponseError, match="NOGROUP"):
        worker_queue.eval(ACK_DELETE, 1, ingest_worker.STREAM, ingest_worker.GROUP, message_id)
    assert worker_queue.xlen(ingest_worker.STREAM) == 1


def test_reclaim_continues_from_returned_scan_cursor(monkeypatch):
    cursors = []

    def claim(*args, **kwargs):
        cursors.append(kwargs["start_id"])
        return ["2000-0" if len(cursors) == 1 else "0-0", [], []]

    connection = SimpleNamespace(xautoclaim=claim)
    cursor, _ = ingest_worker.reclaim(connection, "0-0")
    ingest_worker.reclaim(connection, cursor)
    assert cursors == ["0-0", "2000-0"]


def test_acknowledgement_never_deletes_unclaimed_work(worker_queue):
    message_id = worker_queue.xadd(ingest_worker.STREAM, {"payload": "{}"})
    assert worker_queue.eval(ACK_DELETE, 1, ingest_worker.STREAM, ingest_worker.GROUP, message_id) == 0
    assert worker_queue.xlen(ingest_worker.STREAM) == 1


def test_worker_retries_redis_unavailable_at_startup(monkeypatch):
    calls = []

    def ensure(connection):
        calls.append("ensure")
        if len(calls) == 1:
            raise redis.ConnectionError("Test outage")

    def stop(*args, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(ingest_worker, "make_redis", lambda **kwargs: SimpleNamespace(xreadgroup=stop))
    monkeypatch.setattr(ingest_worker, "ensure_group", ensure)
    monkeypatch.setattr(ingest_worker.time, "sleep", lambda seconds: None)
    ingest_worker.main()
    assert calls == ["ensure", "ensure"]
