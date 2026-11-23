from datetime import datetime, timedelta, timezone
import logging
import smtplib
import time

from sqlalchemy import or_, select
from sqlalchemy.exc import InterfaceError, OperationalError

from app.db.session import SessionLocal
from app.models import Alert, NotificationAttempt
from app.services.notifications import deliver_email

log = logging.getLogger("notifications")
MAX_ATTEMPTS = 5
RETRY_BASE_SECONDS = 30


def retryable(error: Exception) -> bool:
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return bool(error.recipients) and all(400 <= code < 500 for code, _ in error.recipients.values())
    if isinstance(error, smtplib.SMTPResponseException):
        return 400 <= error.smtp_code < 500
    return isinstance(error, smtplib.SMTPServerDisconnected) or (isinstance(error, OSError) and not isinstance(error, smtplib.SMTPException))


def cycle(now: datetime | None = None):
    for _ in range(100):
        attempted_at = now or datetime.now(timezone.utc)
        with SessionLocal.begin() as db:
            attempt = db.scalar(
                select(NotificationAttempt)
                .where(NotificationAttempt.outcome == "pending", or_(NotificationAttempt.next_attempt_at.is_(None), NotificationAttempt.next_attempt_at <= attempted_at))
                .order_by(NotificationAttempt.id).limit(1).with_for_update(skip_locked=True)
            )
            if attempt is None:
                return
            if attempt.attempt_count >= MAX_ATTEMPTS:
                attempt.outcome = "failed"
                attempt.next_attempt_at = None
                continue
            alert = db.get(Alert, attempt.alert_id)
            attempt.attempt_count += 1
            attempt.next_attempt_at = None
            try:
                attempt.outcome = deliver_email(alert, attempt.id) if attempt.channel == "email" else "not_configured"
            except Exception as error:
                if retryable(error) and attempt.attempt_count < MAX_ATTEMPTS:
                    attempt.outcome = "pending"
                    attempt.next_attempt_at = attempted_at + timedelta(seconds=RETRY_BASE_SECONDS * 2 ** (attempt.attempt_count - 1))
                else:
                    attempt.outcome = "failed"
                log.warning("Notification attempt %s delivery %d: %s (%s)", attempt.id, attempt.attempt_count, attempt.outcome, type(error).__name__)
            attempt.attempted_at = attempted_at


def main():
    logging.basicConfig(level=logging.INFO)
    try:
        while True:
            try:
                cycle()
            except (InterfaceError, OperationalError):
                log.warning("Notification database unavailable; retrying")
            time.sleep(2)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
