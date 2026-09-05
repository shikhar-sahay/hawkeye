"""Pydantic schemas for Supabase Realtime token minting."""

from pydantic import BaseModel, Field


class RealtimeTokenResponse(BaseModel):
    """Short-lived JWT for Supabase Realtime, scoped to the caller's source."""

    token: str = Field(..., description="JWT signed with the Supabase JWT secret")
    token_type: str = Field(default="Bearer")
    expires_in: int = Field(..., description="Lifetime of the token in seconds")
    source_id: int = Field(..., description="Source this token is scoped to")
