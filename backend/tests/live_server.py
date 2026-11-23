import os
from pathlib import Path
import signal
import sys
import threading
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["ALERTS_IN_API"] = "0"

import uvicorn
from redis import RedisError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.models import Device, Measurement, Organization, Site, User
from app.main import app
from app.workers import ingest_worker, simulation_worker
from app.api.v1 import ingest, live, system
from app.core import device_auth
from app.core import live as live_core
from app.core.queue import get_redis


def terminate(signum, frame):
    raise SystemExit(0)


def main():
    namespace = f"envirowatch_e2e_{uuid.uuid4().hex}"
    settings.jwt_secret = f"isolated-e2e-secret-{uuid.uuid4().hex}"
    settings.smtp_host = None
    settings.notification_email_recipients = {}
    settings.frontend_base_url = "http://127.0.0.1:5175"
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{namespace}"')
    scoped = engine.execution_options(schema_translate_map={None: namespace})
    sessions = sessionmaker(scoped, autoflush=False)
    stop = threading.Event()
    redis = get_redis()
    stream = f"{namespace}:readings"
    latency = f"{namespace}:latency"
    dead = f"{namespace}:dead"
    channel = f"{namespace}:live"
    threads = []
    try:
        redis.ping()
        Base.metadata.create_all(scoped)
        with sessions.begin() as db:
            org = Organization(id=uuid.uuid4(), name="Real-stack test community")
            db.add(org)
            db.flush()
            site = Site(id=f"{namespace}-site", organization_id=org.id, name="Test Lagos site", latitude=6.5, longitude=3.4)
            db.add(site)
            password_hash = hash_password("integration-test-password")
            db.add_all([User(id=uuid.uuid4(), organization_id=org.id, email=f"{role}@real.envirowatch.test", role=role, password_hash=password_hash) for role in ("admin", "operator")])
            db.flush()
            for index in range(55):
                device = Device(id=f"e2e-sensor-{index:03}", site_id=site.id, type="sensor", metrics=["pm25"], last_seen_at=datetime.now(timezone.utc))
                db.add(device)
                db.flush()
                db.add(Measurement(device_id=device.id, reading_id="initial", metric="pm25", value=25, unit="µg/m³", quality_status="valid", event_time=datetime.now(timezone.utc) - timedelta(seconds=20), received_at=datetime.now(timezone.utc)))
            settings.public_organization_ids = [str(org.id)]

        def database():
            with sessions() as db:
                yield db

        app.dependency_overrides[get_db] = database
        device_auth.SessionLocal = sessions
        live.SessionLocal = sessions
        ingest_worker.SessionLocal = sessions
        simulation_worker.SessionLocal = sessions
        ingest.STREAM = ingest_worker.STREAM = system.STREAM = stream
        ingest_worker.GROUP = namespace
        ingest_worker.CONSUMER = "e2e-worker"
        ingest_worker.DEAD = dead
        ingest_worker.LATENCY_KEY = system.LATENCY_KEY = latency
        ingest_worker.LIVE_CHANNEL = live_core.LIVE_CHANNEL = channel
        live_core.ALLOWED_ORIGINS.append("http://127.0.0.1:5175")
        ingest_worker.ensure_group(redis)

        def consume():
            while not stop.is_set():
                messages = redis.xreadgroup(namespace, "e2e-worker", {stream: ">"}, count=200, block=200)
                if messages:
                    ingest_worker.handle(redis, messages[0][1])

        def simulate():
            while not stop.wait(0.25):
                simulation_worker.cycle()

        for target in (consume, simulate):
            thread = threading.Thread(target=target, daemon=True)
            thread.start()
            threads.append(thread)
        signal.signal(signal.SIGTERM, terminate)
        uvicorn.run(app, host="127.0.0.1", port=8011, log_level="warning")
    finally:
        stop.set()
        for thread in threads:
            thread.join(timeout=10)
        with suppress(RedisError):
            redis.delete(stream, latency, dead)
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{namespace}" CASCADE')
        engine.dispose()


if __name__ == "__main__":
    main()
