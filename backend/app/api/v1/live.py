import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.core.live import ALLOWED_ORIGINS
from app.core.security import hash_token
from app.db.session import SessionLocal
from app.models import RefreshToken, User

router = APIRouter()


def _org_for_cookie(token: str | None) -> str | None:
    if not token:
        return None
    with SessionLocal() as db:
        row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
        if row is None or row.revoked_at is not None or row.expires_at <= datetime.now(timezone.utc):
            return None
        user = db.get(User, row.user_id)
        return str(user.organization_id) if user else None


@router.websocket("/auth/ws")
async def live(websocket: WebSocket):
    if websocket.headers.get("origin") not in ALLOWED_ORIGINS:
        await websocket.close(code=1008)
        return
    org = await run_in_threadpool(_org_for_cookie, websocket.cookies.get("refresh_token"))
    if org is None:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    hub = websocket.app.state.hub
    queue = hub.add(org)

    async def sender() -> None:
        try:
            while True:
                await websocket.send_text(await queue.get())
        except Exception:
            return

    send_task = asyncio.create_task(sender())
    try:
        while True:
            await websocket.receive_text()  # clients send nothing; this notices disconnects
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        hub.remove(org, queue)