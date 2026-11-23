import uuid

from pydantic import BaseModel, ConfigDict, Field


class SiteCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: uuid.UUID
    name: str
    latitude: float
    longitude: float


class SitePage(BaseModel):
    items: list[SiteOut]
    next_cursor: str | None
