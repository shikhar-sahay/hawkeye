"""Pydantic schemas for alerts API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AlertResponse(BaseModel):
    """Alert response schema."""

    id: int
    source_id: int
    event_id: int
    detection_type: str
    detector_name: str
    severity: str
    title: str
    description: str
    evidence: dict[str, Any]
    confidence: float
    status: str
    created_at: datetime
    updated_at: datetime
    ip: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    route: str | None = None
    mitre_tactics: list[str] = Field(default_factory=list)
    mitre_techniques: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    """Paginated alert list response."""

    alerts: list[AlertResponse]
    total: int
    limit: int
    offset: int


class AlertStatusUpdate(BaseModel):
    """Request to update alert status."""

    status: str = Field(..., pattern="^(new|processing|correlated|dismissed)$")


class AlertFilter(BaseModel):
    """Alert query filters."""

    detection_type: str | None = None
    detector_name: str | None = None
    severity: str | None = None
    status: str | None = None
    source_id: int | None = None
    ip: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    route: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class AlertStatsResponse(BaseModel):
    """Alert statistics response."""

    total: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    by_detection_type: dict[str, int]
    by_detector: dict[str, int]
