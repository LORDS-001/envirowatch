from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MeasurementRollup(Base):
    __tablename__ = "measurement_rollups"

    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), primary_key=True)
    metric: Mapped[str] = mapped_column(String(32), primary_key=True)
    granularity: Mapped[str] = mapped_column(String(8), primary_key=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    quality_status: Mapped[str] = mapped_column(String(20), primary_key=True)
    count: Mapped[int] = mapped_column(BigInteger)
    value_sum: Mapped[float] = mapped_column(Float)
    minimum: Mapped[float] = mapped_column(Float)
    maximum: Mapped[float] = mapped_column(Float)
