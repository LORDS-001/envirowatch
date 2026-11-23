import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
import uuid

import pytest

from app.core.live import Hub


def test_slow_socket_is_forced_to_resynchronize():
    hub = Hub()
    queue = hub.add("test-org")
    for _ in range(queue.maxsize):
        queue.put_nowait("event")
    hub.dispatch("test-org", "would otherwise be lost")
    assert queue.get_nowait() is None


def test_all_status_changes_are_published_before_baseline_advances(monkeypatch):
    from app.services import faults

    class Pipeline:
        def __init__(self):
            self.commands = []

        def publish(self, *args):
            self.commands.append(("publish", args))

        def hset(self, *args, **kwargs):
            self.commands.append(("hset", args))

        def execute(self):
            pass

    pipeline = Pipeline()
    redis = SimpleNamespace(hgetall=lambda key: {f"device-{index}": "online" for index in range(120)}, pipeline=lambda: pipeline)
    monkeypatch.setattr(faults, "get_redis", lambda: redis)
    results = [SimpleNamespace(device=SimpleNamespace(id=f"device-{index}", last_seen_at=None), health="silent") for index in range(120)]
    faults.publish_status_changes("test-org", results)
    assert len([command for command in pipeline.commands if command[0] == "publish"]) == 120
    assert pipeline.commands[-1][0] == "hset"


def test_queue_capacity_never_trims_accepted_entries():
    from app.core.queue import ENQUEUE, get_redis

    redis = get_redis()
    try:
        redis.ping()
    except Exception:
        pytest.skip("Redis unavailable: queue capacity integration test could not run")
    stream = f"envirowatch:test:{uuid.uuid4().hex}"
    try:
        first = redis.eval(ENQUEUE, 1, stream, 1, "test-device", datetime.now(timezone.utc).isoformat(), "{}")
        assert first
        assert not redis.eval(ENQUEUE, 1, stream, 1, "test-device", datetime.now(timezone.utc).isoformat(), "{}")
        assert redis.xlen(stream) == 1
        assert redis.xrange(stream)[0][0] == first
    finally:
        redis.delete(stream)


def test_email_outcome_requires_transport_acceptance(monkeypatch):
    from app.core.config import settings
    from app.services.notifications import deliver_email

    monkeypatch.setattr(settings, "smtp_host", "test.invalid")
    monkeypatch.setattr(settings, "smtp_starttls", False)
    monkeypatch.setattr(settings, "notification_from_email", "sender@test.invalid")
    monkeypatch.setattr(settings, "notification_email_recipients", {"test-org": ["recipient@test.invalid"]})
    delivered = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def send_message(self, message):
            delivered.append(message)
            return {}

    monkeypatch.setattr("app.services.notifications.smtplib.SMTP", SMTP)
    alert = SimpleNamespace(id="test-alert", organization_id="test-org", title="High PM", status="active", opened_at=datetime.now(timezone.utc))
    assert deliver_email(alert, 1) == "delivered"
    assert len(delivered) == 1
    monkeypatch.setattr(settings, "notification_email_recipients", {})
    assert deliver_email(alert, 2) == "not_configured"
    assert len(delivered) == 1
