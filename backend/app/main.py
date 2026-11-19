import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.workers.alert_loop import alert_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(alert_loop())
    yield
    task.cancel()


app = FastAPI(title="EnviroWatch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError):
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"] if p not in ("body", "query", "path"))
    message = f"{field}: {first['msg']}" if field else first["msg"]
    return JSONResponse(status_code=422, content={"detail": message})


app.include_router(api_router, prefix="/api/v1")