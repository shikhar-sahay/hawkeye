"""Pydantic schemas for event query API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NormalizedEventResponse(BaseModel):
    """Normalized event response schema."""

    id: int
    source_id: int
    timestamp: datetime
    category: str
    event_type: str
    severity: str
    user_id: str | None = None
    session_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    route: str | None = None
    method: str | None = None
    status_code: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    mitre_tactic: str | None = None
    mitre_technique: str | None = None
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

    category: str | None = None
    event_type: str | None = None
    severity: str | None = None
    user_id: str | None = None
    ip: str | None = None
    route: str | None = None
    method: str | None = None
    status_code: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
