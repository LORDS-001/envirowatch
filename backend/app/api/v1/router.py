from fastapi import APIRouter

from app.api.v1 import (
    alerts, auth, devices, health, heatmap, ingest, live, measurements, reports, retention, sites,
    system, users, public, simulator,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(sites.router)
api_router.include_router(devices.router)
api_router.include_router(ingest.router)
api_router.include_router(measurements.router)
api_router.include_router(system.router)
api_router.include_router(heatmap.router)
api_router.include_router(health.router)
api_router.include_router(alerts.router)
api_router.include_router(alerts.rules_router)
api_router.include_router(retention.router)
api_router.include_router(reports.router)
api_router.include_router(users.router)
api_router.include_router(users.org_router)
api_router.include_router(live.router)
api_router.include_router(public.router)
api_router.include_router(simulator.router)
