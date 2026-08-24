"""API dependencies."""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlmodel import func, select
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

    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.scalars().first()

    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "APIKey"},
        )

    # Get source
    result = await session.execute(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.scalars().first()

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

    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.scalars().first()

    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "APIKey"},
        )

    # Get source
    result = await session.execute(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.scalars().first()

    if not source or not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Source inactive",
            headers={"WWW-Authenticate": "APIKey"},
        )

    return source


async def allow_source_registration(
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Guard for POST /sources.

    Registering the FIRST source is allowed without credentials (bootstrap);
    afterwards a valid API key is required for all source management.
    """
    if api_key:
        await verify_api_key(api_key=api_key, session=session)
        return

    count_result = await session.execute(select(func.count(ApplicationSource.id)))
    total_sources = count_result.scalars().one()
    if total_sources > 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required to register additional sources",
            headers={"WWW-Authenticate": "APIKey"},
        )
