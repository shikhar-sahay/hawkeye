"""API dependencies."""

from collections.abc import AsyncGenerator
from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.database import get_session as get_db_session
from hawkeye.models.events import ApiKey, ApplicationSource

api_key_header = APIKeyHeader(name=settings.api_key_header, auto_error=False)


def _key_is_expired(api_key_obj: ApiKey) -> bool:
    """True when the key has an expiry timestamp in the past (UTC-naive)."""
    return (
        api_key_obj.expires_at is not None
        and api_key_obj.expires_at <= datetime.utcnow()
    )


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

    if _key_is_expired(api_key_obj):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired",
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

    if _key_is_expired(api_key_obj):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired",
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


async def allow_first_key_creation(
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Guard for POST /sources/{source_id}/api-keys.

    Creating the FIRST API key is allowed without credentials (bootstrap:
    a fresh install has a source but no key yet, so something must mint the
    first credential); afterwards a valid API key is required.
    """
    if api_key:
        await verify_api_key(api_key=api_key, session=session)
        return

    count_result = await session.execute(select(func.count(ApiKey.id)))
    total_keys = count_result.scalars().one()
    if total_keys > 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required to create additional keys",
            headers={"WWW-Authenticate": "APIKey"},
        )


async def require_source_for_key_creation(
    source_id: int,
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """Auth for POST /sources/{source_id}/api-keys.

    Without credentials this allows creating the FIRST API key (bootstrap:
    a fresh install has a source but no key yet, so something must mint the
    first credential) and otherwise raises 401. With credentials, the caller
    must own the target source, except when minting the very first key of a
    keyless source (onboarding: any authenticated key may initialize a source
    that has no keys yet; the window closes once the first key exists).
    """
    if api_key:
        current = await get_current_source(api_key=api_key, session=session)
        if current.id == source_id:
            return current
        # Onboarding carve-out: any authenticated key may mint the FIRST key
        # of a source that has no keys yet (e.g. a source just created via
        # POST /sources). The window closes once the first key exists.
        key_count = await session.execute(
            select(func.count(ApiKey.id)).where(ApiKey.source_id == source_id)
        )
        if key_count.scalars().one() == 0:
            result = await session.execute(
                select(ApplicationSource).where(ApplicationSource.id == source_id)
            )
            target = result.scalars().first()
            if not target:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Source not found",
                )
            return target
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    count_result = await session.execute(select(func.count(ApiKey.id)))
    if count_result.scalars().one() > 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required to create additional keys",
            headers={"WWW-Authenticate": "APIKey"},
        )

    result = await session.execute(
        select(ApplicationSource).where(ApplicationSource.id == source_id)
    )
    source = result.scalars().first()
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )
    return source


async def require_source_ownership(
    source_id: int,
    api_key: str = Depends(api_key_header),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """Auth for source-scoped management endpoints.

    Behaves like `get_current_source`, but additionally requires the caller
    to own the target source. A mismatch raises 404 (not 403) so the endpoint
    does not confirm whether other sources exist.
    """
    current = await get_current_source(api_key=api_key, session=session)
    if current.id != source_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )
    return current
