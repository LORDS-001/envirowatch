from pathlib import Path
from hashlib import sha256
from uuid import UUID
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore", hide_input_in_errors=True)

    database_url: str = Field(repr=False)
    redis_url: str = Field(repr=False)
    jwt_secret: str = Field(repr=False)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cookie_secure: bool = False
    environment: Literal["development", "test", "production"] = "development"
    allowed_origins: list[str] = ["http://localhost:5173"]
    ingest_capacity: int = Field(default=500_000, ge=1)
    max_request_body_bytes: int = Field(default=1_048_576, ge=65_536, le=10_485_760)
    public_organization_ids: list[str] = []
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_starttls: bool = True
    smtp_username: str | None = None
    smtp_password: str | None = Field(default=None, repr=False)
    notification_from_email: str | None = None
    notification_email_recipients: dict[str, list[str]] = {}
    frontend_base_url: str = "http://localhost:5173"

    @model_validator(mode="after")
    def production_security(self):
        for organization_id in self.public_organization_ids:
            UUID(organization_id)
        if self.environment == "production":
            if len(self.jwt_secret) < 48 or self.jwt_secret.startswith("change-") or sha256(self.jwt_secret.encode()).hexdigest() == "fd7d7f504af50da791c7fbb4b16b779cbbf877422354d2c3bf54364b2c264dc5":
                raise ValueError("Production requires a private JWT_SECRET of at least 48 characters")
            if not self.cookie_secure:
                raise ValueError("Production requires COOKIE_SECURE=true")
            if not self.allowed_origins:
                raise ValueError("Production requires explicit allowed origins")
            for origin in self.allowed_origins:
                parsed = urlsplit(origin)
                if (parsed.scheme != "https" or not parsed.hostname or "*" in origin
                        or parsed.username is not None or parsed.password is not None
                        or parsed.path or parsed.query or parsed.fragment):
                    raise ValueError("Production origins must be explicit HTTPS origins without paths or credentials")
                parsed.port
            if self.smtp_host and not self.smtp_starttls:
                raise ValueError("Production SMTP requires STARTTLS")
            if not self.frontend_base_url.startswith("https://"):
                raise ValueError("Production FRONTEND_BASE_URL must use HTTPS")
        return self


settings = Settings()
