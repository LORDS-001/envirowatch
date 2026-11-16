import uuid

from pydantic import BaseModel, ConfigDict


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    latitude: float
    longitude: float


class SitePage(BaseModel):
    items: list[SiteOut]
    next_cursor: str | None