"""Pydantic schemas for alerts API."""

from datetime import datetime
from typing import Any, Optional

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
    ip: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    route: Optional[str] = None
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

    detection_type: Optional[str] = None
    detector_name: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    source_id: Optional[int] = None
    ip: Optional[str] = None
    user_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class AlertStatsResponse(BaseModel):
    """Alert statistics response."""

    total: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    by_detection_type: dict[str, int]
    by_detector: dict[str, int]