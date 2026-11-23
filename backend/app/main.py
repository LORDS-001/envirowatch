import asyncio
import os
import logging
import time

from fastapi import Request
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.body_limit import RequestBodyLimitMiddleware
from app.core.config import settings
from app.core.live import ALLOWED_ORIGINS, Hub, subscriber
from app.workers.alert_loop import alert_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub = Hub()
    app.state.hub = hub
    tasks = [
        asyncio.create_task(subscriber(hub)),
        asyncio.create_task(hub.heartbeat_loop()),
    ]
    if os.environ.get("ALERTS_IN_API") == "1":  # default: the alert engine is its own process
        tasks.append(asyncio.create_task(alert_loop()))
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="EnviroWatch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=settings.max_request_body_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"] if p not in ("body", "query", "path"))
    message = f"{field}: {first['msg']}" if field else first["msg"]
    return JSONResponse(status_code=422, content={"detail": message})

slow_log = logging.getLogger("slow")


@app.middleware("http")
async def slow_ingest_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    total = (time.perf_counter() - start) * 1000
    t = getattr(request.state, "timing", None)
    if total > 500 and t:
        slow_log.warning(
            "SLOW ingest total=%.0f ms: waited %.0f ms for a thread, auth %.0f ms, xadd %.0f ms",
            total, (t["start"] - start) * 1000, t["auth_ms"], t["xadd_ms"],
        )
    return response

app.include_router(api_router, prefix="/api/v1")
