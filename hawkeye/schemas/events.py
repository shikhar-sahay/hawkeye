"""Pydantic schemas for event query API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class NormalizedEventResponse(BaseModel):
    """Normalized event response schema."""

    id: int
    source_id: int
    timestamp: datetime
    category: str
    event_type: str
    severity: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    route: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    mitre_tactic: Optional[str] = None
    mitre_technique: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EventListResponse(BaseModel):
    """Paginated event list response."""

    events: list[NormalizedEventResponse]
    total: int
    limit: int
    offset: int


class EventFilter(BaseModel):
    """Event query filters."""

    category: Optional[str] = None
    event_type: Optional[str] = None
    severity: Optional[str] = None
    user_id: Optional[str] = None
    ip: Optional[str] = None
    route: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)