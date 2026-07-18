"""Pydantic schemas for source and API key management."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SourceCreate(BaseModel):
    """Create application source request."""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)


class SourceResponse(BaseModel):
    """Application source response."""

    id: int
    name: str
    description: Optional[str] = None
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

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class ApiKeyCreate(BaseModel):
    """Create API key request."""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    """API key response (includes plain key only on creation)."""

    id: int
    source_id: int
    name: str
    description: Optional[str] = None
    is_active: bool
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    # Only included on creation
    plain_key: Optional[str] = None

    model_config = {"from_attributes": True}


class ApiKeyListResponse(BaseModel):
    """Paginated API key list response."""

    keys: list[ApiKeyResponse]
    total: int
    limit: int
    offset: int


class ApiKeyUpdate(BaseModel):
    """Update API key request."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None