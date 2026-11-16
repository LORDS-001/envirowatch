from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import authenticate_device
from app.db.session import get_db
from app.services.ingestion import process_reading

router = APIRouter(tags=["ingestion"])


@router.post("/ingest", status_code=202)
def ingest(
    response: Response,
    payload: dict = Body(...),
    x_api_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    
    device = authenticate_device(db, x_api_key)
    result = process_reading(db, device, payload, datetime.now(timezone.utc))
    if result.outcome == "rejected":
        raise HTTPException(422, detail=result.reason)
    if result.outcome == "duplicate":
        response.status_code = 200
    return {"status": result.outcome, "reading_id": result.reading_id, "reason": result.reason}