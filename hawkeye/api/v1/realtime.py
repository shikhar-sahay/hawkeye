"""Realtime token minting for Supabase Realtime (split deployment).

Flow: browser presents its HawkEye source API key -> this endpoint validates
it with the existing auth logic -> mints a short-lived JWT carrying ONLY the
server-derived source_id -> browser uses it for Supabase Realtime auth.

The browser never chooses its own source_id, and the Supabase JWT secret and
service-role key never leave the server.
"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status

from hawkeye.api.deps import get_current_source
from hawkeye.config import settings
from hawkeye.models.events import ApplicationSource
from hawkeye.schemas import RealtimeTokenResponse

router = APIRouter(tags=["realtime"])

logger = logging.getLogger(__name__)

_REALTIME_UNCONFIGURED = "Realtime is not configured on this backend"


def mint_realtime_token(source_id: int) -> tuple[str, int]:
    """Mint a short-lived Supabase Realtime JWT scoped to one source.

    Returns (token, expires_in_seconds). Raises RuntimeError when the
    Supabase JWT secret is not configured.
    """
    secret = settings.supabase_jwt_secret
    if not secret:
        logger.warning("SUPABASE_JWT_SECRET is not configured")
        raise RuntimeError
    from jose import jwt

    now = int(time.time())
    ttl = settings.realtime_token_ttl_seconds
    claims = {
        "role": "authenticated",
        "source_id": source_id,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(claims, secret, algorithm="HS256"), ttl


@router.post(
    "/realtime-token",
    response_model=RealtimeTokenResponse,
    summary="Mint a short-lived Supabase Realtime token",
)
async def create_realtime_token(
    source: ApplicationSource = Depends(get_current_source),
) -> RealtimeTokenResponse:
    """Validate the caller's API key and return a source-scoped Realtime JWT.

    The source_id claim is derived exclusively from the validated key;
    request bodies and query parameters cannot influence it (the endpoint
    accepts none).
    """
    try:
        token, ttl = mint_realtime_token(source.id)
    except RuntimeError:
        logger.warning("Realtime token requested but SUPABASE_JWT_SECRET is unset")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_REALTIME_UNCONFIGURED,
        )
    return RealtimeTokenResponse(
        token=token, expires_in=ttl, source_id=source.id
    )
