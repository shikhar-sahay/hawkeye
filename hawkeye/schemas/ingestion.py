"""Pydantic schemas for event ingestion API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class RawEventIngest(BaseModel):
    """Single event ingestion request."""

    event_type: str = Field(..., min_length=1, max_length=100)
    timestamp: Optional[datetime] = None
    user_id: Optional[str] = Field(default=None, max_length=100)
    session_id: Optional[str] = Field(default=None, max_length=100)
    ip: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    route: Optional[str] = Field(default=None, max_length=500)
    method: Optional[str] = Field(default=None, max_length=10)
    status_code: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Basic IP validation
        import re
        ipv4_pattern = r"^(\d{1,3}\.){3}\d{1,3}$"
        ipv6_pattern = r"^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$"
        if re.match(ipv4_pattern, v):
            parts = v.split(".")
            if all(0 <= int(p) <= 255 for p in parts):
                return v
        if re.match(ipv6_pattern, v):
            return v
        raise ValueError("Invalid IP address format")

    @field_validator("status_code")
    @classmethod
    def validate_status(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (100 <= v <= 599):
            raise ValueError("Invalid HTTP status code")
        return v


class BatchEventsIngest(BaseModel):
    """Batch event ingestion request."""

    events: list[RawEventIngest] = Field(..., min_length=1, max_length=1000)
    source: Optional[str] = Field(default=None, max_length=100)


class EventIngestResponse(BaseModel):
    """Response for single event ingestion."""

    success: bool
    event_id: Optional[int] = None
    normalized_event_id: Optional[int] = None


class BatchIngestResponse(BaseModel):
    """Response for batch ingestion."""

    success: bool
    accepted: int
    failed: int
    event_ids: list[int] = []


class EventFilter(BaseModel):
    """Event query filters."""

    event_type: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    user_id: Optional[str] = None
    ip: Optional[str] = None
    route: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)