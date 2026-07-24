"""Pydantic schemas for source and API key management."""

from datetime import datetime

from pydantic import BaseModel, Field


class SourceCreate(BaseModel):
    """Create application source request."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class SourceResponse(BaseModel):
    """Application source response."""

    id: int
    name: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SourceListResponse(BaseModel):
    """Paginated source list response."""

    sources: list[SourceResponse]
    total: int
    limit: int
    offset: int


class SourceUpdate(BaseModel):
    """Update application source request."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class ApiKeyCreate(BaseModel):
    """Create API key request."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    """API key response (includes plain key only on creation)."""

    id: int
    source_id: int
    name: str
    description: str | None = None
    is_active: bool
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    # Only included on creation
    plain_key: str | None = None

    model_config = {"from_attributes": True}


class ApiKeyListResponse(BaseModel):
    """Paginated API key list response."""

    keys: list[ApiKeyResponse]
    total: int
    limit: int
    offset: int


class ApiKeyUpdate(BaseModel):
    """Update API key request."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    expires_at: datetime | None = None
