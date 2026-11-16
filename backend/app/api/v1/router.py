from fastapi import APIRouter

from app.api.v1 import auth, devices,ingest,  sites

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(sites.router)
api_router.include_router(devices.router)
api_router.include_router(ingest.router)