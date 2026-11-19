import json
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Body, Header, HTTPException

from app.core.device_auth import authenticate
from app.core.queue import STREAM, get_redis

router = APIRouter(tags=["ingestion"])

MAX_STREAM = 500_000  

@router.post("/ingest", status_code=202)
def ingest(payload: dict = Body(...), x_api_key: str | None = Header(default=None)):
    device = authenticate(x_api_key)

    reading_id = payload.get("reading_id")
    if not isinstance(reading_id, str) or not 1 <= len(reading_id) <= 128:
        raise HTTPException(422, detail="reading_id must be a string of 1-128 characters")
    if payload.get("device_id", device.id) != device.id:
        raise HTTPException(422, detail="device_id does not match the API key")
    if not isinstance(payload.get("timestamp"), str) or not isinstance(payload.get("measurements"), dict):
        raise HTTPException(422, detail="timestamp and a measurements object are required")

    try:
        get_redis().xadd(
            STREAM,
            {
                "device_id": device.id,
                "received_at": datetime.now(timezone.utc).isoformat(),
                "payload": json.dumps(payload),
            },
            maxlen=MAX_STREAM,
            approximate=True,
        )
    except redis.RedisError:
        raise HTTPException(503, detail="Ingestion queue unavailable, retry shortly")
    return {"status": "queued", "reading_id": reading_id}