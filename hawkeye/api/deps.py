"""API dependencies."""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.database import get_session as get_db_session
from hawkeye.models.events import ApiKey, ApplicationSource

api_key_header = APIKeyHeader(name=settings.api_key_header, auto_error=False)


async def get_current_source(
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """Verify API key and return the associated source."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "APIKey"},
        )

    from hawkeye.core.auth import hash_api_key

    key_hash = hash_api_key(api_key)

    result = await session.exec(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.first()

    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "APIKey"},
        )

    # Get source
    result = await session.exec(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.first()

    if not source or not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Source inactive",
            headers={"WWW-Authenticate": "APIKey"},
        )

    return source

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session - re-export for convenience."""
    async for session in get_db_session():
        yield session


async def verify_api_key(
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """Verify API key without requiring full source context."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "APIKey"},
        )

    from hawkeye.core.auth import hash_api_key

    key_hash = hash_api_key(api_key)

    result = await session.exec(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.first()

    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "APIKey"},
        )

    # Get source
    result = await session.exec(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.first()

    if not source or not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Source inactive",
            headers={"WWW-Authenticate": "APIKey"},
        )

    return source
