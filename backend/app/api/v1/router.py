from fastapi import APIRouter

from app.api.v1 import auth, devices,heatmap, ingest, measurements, sites, system, health

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(sites.router)
api_router.include_router(devices.router)
api_router.include_router(ingest.router)
api_router.include_router(measurements.router)
api_router.include_router(system.router)
api_router.include_router(heatmap.router)
api_router.include_router(health.router)