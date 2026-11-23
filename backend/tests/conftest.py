import os
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def isolated_security_and_delivery(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "jwt_secret", "isolated-test-secret-not-for-production-use-only")
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "notification_email_recipients", {})
    monkeypatch.setattr(settings, "public_organization_ids", [])


@pytest.fixture(scope="session")
def test_engine():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests in an isolated temporary schema")
    from app.db.base import Base
    import app.models

    schema = f"envirowatch_test_{uuid.uuid4().hex}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    scoped = engine.execution_options(schema_translate_map={None: schema})
    try:
        Base.metadata.create_all(scoped)
        yield scoped
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        engine.dispose()


@pytest.fixture
def db(test_engine):
    with test_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint", autoflush=False)
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def tenant(db):
    from app.core.security import hash_password
    from app.models import Organization, Site, User

    organization = Organization(id=uuid.uuid4(), name="Test community")
    db.add(organization)
    db.flush()
    site = Site(id=f"site-{uuid.uuid4().hex[:12]}", organization_id=organization.id, name="Test site", latitude=6.5, longitude=3.4)
    user = User(id=uuid.uuid4(), organization_id=organization.id, email=f"{uuid.uuid4().hex}@test.invalid", password_hash=hash_password("test-password-only"), role="admin")
    db.add_all([site, user])
    db.flush()
    return organization, site, user


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.db.session import get_db

    app.dependency_overrides[get_db] = lambda: db
    http = TestClient(app)
    try:
        yield http
    finally:
        http.close()
        app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(tenant):
    from app.core.security import create_access_token

    _, _, user = tenant
    return {"Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"}
