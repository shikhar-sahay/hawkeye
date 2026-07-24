"""Pydantic schemas for event ingestion API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class RawEventIngest(BaseModel):
    """Single event ingestion request."""

    event_type: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime | None = None
    user_id: str | None = Field(default=None, max_length=100)
    session_id: str | None = Field(default=None, max_length=100)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    route: str | None = Field(default=None, max_length=500)
    method: str | None = Field(default=None, max_length=10)
    status_code: int | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: str | None) -> str | None:
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
    def validate_status(cls, v: int | None) -> int | None:
        if v is not None and not (100 <= v <= 599):
            raise ValueError("Invalid HTTP status code")
        return v


class BatchEventsIngest(BaseModel):
    """Batch event ingestion request."""

    events: list[RawEventIngest] = Field(..., min_length=1, max_length=1000)
    source: str | None = Field(default=None, max_length=100)


class EventIngestResponse(BaseModel):
    """Response for single event ingestion."""

    success: bool
    event_id: int | None = None
    normalized_event_id: int | None = None


class BatchIngestResponse(BaseModel):
    """Response for batch ingestion."""

    success: bool
    accepted: int
    failed: int
    event_ids: list[int] = []


class EventFilter(BaseModel):
    """Event query filters."""

    event_type: str | None = None
    category: str | None = None
    severity: str | None = None
    user_id: str | None = None
    ip: str | None = None
    route: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
