from email.message import EmailMessage
from email.utils import make_msgid
import smtplib
import ssl

from app.core.config import settings


class PartialDeliveryError(smtplib.SMTPException):
    pass


def email_configured(organization_id) -> bool:
    return bool(settings.smtp_host and settings.notification_from_email and settings.notification_email_recipients.get(str(organization_id)))


def deliver_email(alert, attempt_id: int):
    recipients = settings.notification_email_recipients.get(str(alert.organization_id), [])
    if not email_configured(alert.organization_id):
        return "not_configured"
    message = EmailMessage()
    message["From"] = settings.notification_from_email
    message["To"] = ", ".join(recipients)
    message["Subject"] = "EnviroWatch: " + alert.title.replace("\r", " ").replace("\n", " ")
    message["Message-ID"] = f"<envirowatch-{attempt_id}-{alert.id}@notifications.envirowatch.invalid>"
    message.set_content(f"{alert.title}\n\nAlert: {alert.id}\nStatus: {alert.status}\nOpened (UTC): {alert.opened_at.isoformat()}\n\nSign in to EnviroWatch to investigate and acknowledge this alert.")
    return _send(message)


def deliver_invitation(email: str, token: str):
    if not settings.smtp_host or not settings.notification_from_email:
        return "not_configured"
    message = EmailMessage()
    message["From"] = settings.notification_from_email
    message["To"] = email
    message["Subject"] = "Your EnviroWatch invitation"
    message["Message-ID"] = make_msgid()
    link = f"{settings.frontend_base_url.rstrip('/')}/accept-invitation#{token}"
    message.set_content(f"An administrator invited you to EnviroWatch.\n\nChoose your password using this one-time link, valid for 24 hours:\n{link}\n\nIf you were not expecting this invitation, ignore it.")
    try:
        return _send(message)
    except Exception:
        return "failed"


def _send(message: EmailMessage):
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
        if settings.smtp_starttls:
            client.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password or "")
        refused = client.send_message(message)
        if refused:
            raise PartialDeliveryError("Some recipients were refused after others were accepted")
    return "delivered"
