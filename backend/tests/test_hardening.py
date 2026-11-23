import asyncio

import pytest
from pydantic import ValidationError

from app.core.body_limit import RequestBodyLimitMiddleware
from app.core.config import Settings


def exchange(chunks, headers=(), path="/api/v1/auth/login", limit=8):
    sent, bodies, consumed = [], [], []
    messages = iter({"type": "http.request", "body": chunk, "more_body": index < len(chunks) - 1} for index, chunk in enumerate(chunks))

    async def receive():
        message = next(messages)
        consumed.append(message)
        return message

    async def send(message):
        sent.append(message)

    async def downstream(scope, receive, send):
        bodies.append((await receive())["body"])
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    scope = {"type": "http", "path": path, "headers": list(headers)}
    asyncio.run(RequestBodyLimitMiddleware(downstream, limit)(scope, receive, send))
    return sent, bodies, consumed


def test_declared_oversize_is_rejected_before_reading_or_parsing():
    sent, bodies, consumed = exchange([b"not-json"], [(b"content-length", b"9")])
    assert sent[0]["status"] == 413
    assert not bodies and not consumed


@pytest.mark.parametrize("headers", [[], [(b"content-length", b"1")]])
def test_chunked_or_understated_oversize_never_reaches_application(headers):
    sent, bodies, consumed = exchange([b"12345", b"6789"], headers)
    assert sent[0]["status"] == 413
    assert not bodies
    assert len(consumed) == 2


def test_body_at_limit_is_replayed_intact():
    sent, bodies, _ = exchange([b"1234", b"5678"])
    assert sent[0]["status"] == 204
    assert bodies == [b"12345678"]


@pytest.mark.parametrize("headers", [[(b"content-length", b"-1")], [(b"content-length", b"invalid")], [(b"content-length", b"1"), (b"content-length", b"1")]])
def test_invalid_content_length_is_rejected(headers):
    sent, bodies, consumed = exchange([b""], headers)
    assert sent[0]["status"] == 400
    assert not bodies and not consumed


@pytest.mark.parametrize("path", ["/api/v1/ingest", "/api/v1/ingest/"])
def test_ingestion_has_a_smaller_wire_limit(path):
    sent, bodies, _ = exchange([b"x" * 65_537], path=path, limit=1_048_576)
    assert sent[0]["status"] == 413
    assert not bodies


def test_api_rejects_large_invalid_json_before_device_auth(client, monkeypatch):
    def unexpected_authentication(*args):
        pytest.fail("Oversized requests must not reach authentication")

    monkeypatch.setattr("app.api.v1.ingest.authenticate", unexpected_authentication)
    response = client.post("/api/v1/ingest", content=b"x" * 65_537, headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    assert response.json()["detail"] == "Request body too large"


@pytest.mark.parametrize("origins", [[], ["*"], ["https://"], ["https://*.example.com"], ["https://example.com/path"], ["https://user:password@example.com"], ["https://example.com?query=1"], ["https://example.com#fragment"], ["https://example.com:bad"], ["http://example.com"]])
def test_production_rejects_unsafe_origins(origins):
    with pytest.raises(ValidationError):
        production_settings(origins)


def production_settings(origins):
    return Settings(_env_file=None, database_url="postgresql://test:test@localhost/test", redis_url="redis://localhost/0", jwt_secret="isolated-production-validation-test-only-" * 2, environment="production", cookie_secure=True, allowed_origins=origins, frontend_base_url="https://dashboard.example.com")


def test_production_accepts_explicit_https_origin():
    configuration = production_settings(["https://dashboard.example.com:8443"])
    assert configuration.cookie_secure


def test_websocket_scopes_bypass_http_body_buffering():
    scopes = []

    async def downstream(scope, receive, send):
        scopes.append(scope)

    scope = {"type": "websocket"}
    asyncio.run(RequestBodyLimitMiddleware(downstream, 8)(scope, None, None))
    assert scopes == [scope]
