"""Pydantic schemas for incident API responses."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AlertSummary(BaseModel):
    """Minimal alert info for incident responses."""

    id: int
    detection_type: str
    detector_name: str
    severity: str
    title: str
    created_at: datetime
    ip: Optional[str] = None
    user_id: Optional[str] = None

    model_config = {"from_attributes": True}


class IncidentAlertLink(BaseModel):
    """Link between incident and alert with sequence."""

    incident_id: int
    alert_id: int
    sequence: int
    created_at: datetime


class IncidentResponse(BaseModel):
    """Incident response schema."""

    id: int
    title: str
    description: str
    severity: str
    status: str
    confidence: float
    affected_ips: list[str]
    affected_users: list[str]
    affected_routes: list[str]
    mitre_tactics: list[str]
    mitre_techniques: list[str]
    first_event_at: datetime
    last_event_at: datetime
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    # Related data
    source_id: int
    alerts: list[AlertSummary] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    """Paginated incident list response."""

    incidents: list[IncidentResponse]
    total: int
    limit: int
    offset: int


class IncidentStatusUpdate(BaseModel):
    """Request to update incident status."""

    status: str = Field(..., pattern="^(open|investigating|contained|resolved|closed)$")


class IncidentFilter(BaseModel):
    """Incident query filters."""

    severity: Optional[str] = None
    status: Optional[str] = None
    source_id: Optional[int] = None
    affected_ip: Optional[str] = None
    affected_user: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class IncidentStatsResponse(BaseModel):
    """Incident statistics response."""

    total: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    open_count: int
    critical_count: int