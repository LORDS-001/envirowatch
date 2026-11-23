from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import smtplib
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.models import Alert, NotificationAttempt, Organization
from app.services.notifications import PartialDeliveryError
from app.workers import notification_worker
from app.workers import simulation_worker


@pytest.fixture
def pending_notification(db, tenant, monkeypatch):
    now = datetime.now(timezone.utc)
    alert = Alert(organization_id=tenant[0].id, fingerprint="retry-test", kind="device", title="Test alert", status="active", opened_at=now)
    db.add(alert)
    db.flush()
    attempt = NotificationAttempt(alert_id=alert.id, channel="email", outcome="pending", attempted_at=now)
    db.add(attempt)
    db.flush()

    @contextmanager
    def transaction():
        with db.begin_nested():
            yield db

    monkeypatch.setattr(notification_worker, "SessionLocal", SimpleNamespace(begin=transaction))
    return attempt, now


def test_transient_delivery_is_persisted_and_only_retried_when_due(pending_notification, db, monkeypatch):
    attempt, now = pending_notification
    calls = []

    def unavailable(alert, attempt_id):
        calls.append(attempt_id)
        raise smtplib.SMTPDataError(451, b"Try later")

    monkeypatch.setattr(notification_worker, "deliver_email", unavailable)
    notification_worker.cycle(now)
    db.expire_all()
    assert attempt.outcome == "pending"
    assert attempt.attempt_count == 1
    assert attempt.next_attempt_at == now + timedelta(seconds=30)
    notification_worker.cycle(now + timedelta(seconds=29))
    assert len(calls) == 1
    monkeypatch.setattr(notification_worker, "deliver_email", lambda alert, attempt_id: "delivered")
    notification_worker.cycle(now + timedelta(seconds=30))
    assert attempt.outcome == "delivered"
    assert attempt.attempt_count == 2
    assert attempt.next_attempt_at is None
    notification_worker.cycle(now + timedelta(hours=1))
    assert attempt.attempt_count == 2


def test_delivery_stops_after_bounded_exponential_retries(pending_notification, monkeypatch):
    attempt, now = pending_notification

    def unavailable(*args):
        raise ConnectionError("Test transport unavailable")

    monkeypatch.setattr(notification_worker, "deliver_email", unavailable)
    for count in range(1, 6):
        notification_worker.cycle(now)
        assert attempt.attempt_count == count
        if count < 5:
            assert attempt.outcome == "pending"
            assert attempt.next_attempt_at == now + timedelta(seconds=30 * 2 ** (count - 1))
            now = attempt.next_attempt_at
        else:
            assert attempt.outcome == "failed"
            assert attempt.next_attempt_at is None
    notification_worker.cycle(now + timedelta(days=1))
    assert attempt.attempt_count == 5


@pytest.mark.parametrize("error", [smtplib.SMTPAuthenticationError(535, b"Invalid credentials"), smtplib.SMTPRecipientsRefused({"recipient@test.invalid": (550, b"Refused")}), PartialDeliveryError("Some accepted"), ValueError("Test failure")])
def test_permanent_or_partial_failure_is_not_automatically_resent(pending_notification, monkeypatch, error):
    attempt, now = pending_notification

    def refused(*args):
        raise error

    monkeypatch.setattr(notification_worker, "deliver_email", refused)
    notification_worker.cycle(now)
    assert attempt.outcome == "failed"
    assert attempt.attempt_count == 1
    assert attempt.next_attempt_at is None


def test_notification_message_id_is_stable_across_retries(monkeypatch):
    from app.core.config import settings
    from app.services import notifications

    monkeypatch.setattr(settings, "smtp_host", "test.invalid")
    monkeypatch.setattr(settings, "notification_from_email", "sender@test.invalid")
    monkeypatch.setattr(settings, "notification_email_recipients", {"test-org": ["recipient@test.invalid"]})
    messages = []
    monkeypatch.setattr(notifications, "_send", lambda message: messages.append(message) or "delivered")
    alert = SimpleNamespace(id="test-alert", organization_id="test-org", title="High PM", status="active", opened_at=datetime.now(timezone.utc))
    notifications.deliver_email(alert, 42)
    notifications.deliver_email(alert, 42)
    assert messages[0]["Message-ID"] == messages[1]["Message-ID"]


def test_concurrent_worker_skips_locked_delivery_and_does_not_resend(test_engine, monkeypatch):
    sessions = sessionmaker(test_engine)
    organization_id = uuid.uuid4()
    alert_id = f"alert-{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    try:
        with sessions.begin() as db:
            db.add(Organization(id=organization_id, name="Isolated notification locking test"))
            db.flush()
            db.add(Alert(id=alert_id, organization_id=organization_id, fingerprint=alert_id, kind="device", title="Lock test", status="active", opened_at=now))
            db.flush()
            attempt = NotificationAttempt(alert_id=alert_id, channel="email", outcome="pending", attempted_at=now)
            db.add(attempt)
            db.flush()
            attempt_id = attempt.id
        calls = []
        monkeypatch.setattr(notification_worker, "SessionLocal", sessions)
        monkeypatch.setattr(notification_worker, "deliver_email", lambda alert, delivery_id: calls.append(delivery_id) or "delivered")
        with sessions.begin() as owner:
            owner.scalar(select(NotificationAttempt).where(NotificationAttempt.id == attempt_id).with_for_update())
            notification_worker.cycle(now)
            assert calls == []
        notification_worker.cycle(now)
        notification_worker.cycle(now)
        assert calls == [attempt_id]
        with sessions() as db:
            assert db.get(NotificationAttempt, attempt_id).attempt_count == 1
    finally:
        with sessions.begin() as db:
            db.execute(delete(NotificationAttempt).where(NotificationAttempt.alert_id == alert_id))
            db.execute(delete(Alert).where(Alert.id == alert_id))
            db.execute(delete(Organization).where(Organization.id == organization_id))


@pytest.mark.parametrize("error", [smtplib.SMTPDataError(451, b"Temporary"), smtplib.SMTPRecipientsRefused({"recipient@test.invalid": (450, b"Temporary")}), smtplib.SMTPServerDisconnected("Disconnected"), TimeoutError()])
def test_known_transient_transport_errors_are_retryable(error):
    assert notification_worker.retryable(error)


@pytest.mark.parametrize("worker", [notification_worker, simulation_worker])
def test_worker_loop_survives_a_database_connection_failure(worker, monkeypatch):
    calls = []

    def cycle():
        calls.append("cycle")
        if len(calls) == 1:
            raise OperationalError("test", {}, Exception("Test outage"))
        raise KeyboardInterrupt

    monkeypatch.setattr(worker, "cycle", cycle)
    monkeypatch.setattr(worker.time, "sleep", lambda seconds: None)
    worker.main()
    assert calls == ["cycle", "cycle"]
