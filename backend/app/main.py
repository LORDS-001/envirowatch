import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
)

app.include_router(api_router, prefix="/api/v1")