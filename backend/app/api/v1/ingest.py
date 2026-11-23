import json
import time
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Body, Header, HTTPException, Request

from app.core.device_auth import authenticate
from app.core.queue import ENQUEUE, STREAM, get_redis
from app.core.config import settings

router = APIRouter(tags=["ingestion"])

@router.post("/ingest", status_code=202)
def ingest(request: Request, payload: dict = Body(...), x_api_key: str | None = Header(default=None)):
    t0 = time.perf_counter()
    device = authenticate(x_api_key)
    t1 = time.perf_counter()

    reading_id = payload.get("reading_id")
    if not isinstance(reading_id, str) or not 1 <= len(reading_id) <= 128:
        raise HTTPException(422, detail="reading_id must be a string of 1-128 characters")
    if payload.get("device_id", device.id) != device.id:
        raise HTTPException(422, detail="device_id does not match the API key")
    if not isinstance(payload.get("timestamp"), str) or not isinstance(payload.get("measurements"), dict):
        raise HTTPException(422, detail="timestamp and a measurements object are required")

    encoded = json.dumps(payload)
    if len(encoded.encode()) > 65_536:
        raise HTTPException(413, detail="A reading cannot exceed 64 KiB")
    try:
        queued = get_redis().eval(ENQUEUE, 1, STREAM, settings.ingest_capacity, device.id, datetime.now(timezone.utc).isoformat(), encoded)
        if not queued:
            raise HTTPException(503, detail="Ingestion queue is full; retry shortly", headers={"Retry-After": "1"})
    except redis.RedisError:
        raise HTTPException(503, detail="Ingestion queue unavailable, retry shortly")
    t2 = time.perf_counter()
    request.state.timing = {"start": t0, "auth_ms": (t1 - t0) * 1000, "xadd_ms": (t2 - t1) * 1000}
    return {"status": "queued", "reading_id": reading_id}
