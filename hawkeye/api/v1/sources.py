"""Source and API key management API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_session
from hawkeye.core.auth import generate_api_key
from hawkeye.models.events import ApiKey, ApplicationSource
from hawkeye.schemas import (
    ApiKeyCreate,
    ApiKeyListResponse,
    ApiKeyResponse,
    ApiKeyUpdate,
    SourceCreate,
    SourceListResponse,
    SourceResponse,
    SourceUpdate,
)

router = APIRouter(prefix="/sources", tags=["sources"])


@router.post(
    "",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new application source",
)
async def create_source(
    source_data: SourceCreate,
    session: AsyncSession = Depends(get_session),
) -> SourceResponse:
    """Register a new application source (admin endpoint)."""
    source = ApplicationSource(
        name=source_data.name,
        description=source_data.description,
        is_active=True,
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)

    return SourceResponse.model_validate(source)


@router.get(
    "",
    response_model=SourceListResponse,
    summary="List all application sources",
)
async def list_sources(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> SourceListResponse:
    """List all registered application sources."""
    stmt = select(ApplicationSource).offset(offset).limit(limit)
    count_stmt = select(func.count(ApplicationSource.id))

    result = await session.exec(stmt)
    sources = list(result.all())

    count_result = await session.exec(count_stmt)
    total = count_result.one()

    return SourceListResponse(
        sources=[SourceResponse.model_validate(s) for s in sources],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{source_id}",
    response_model=SourceResponse,
    summary="Get a source by ID",
)
async def get_source(
    source_id: int,
    session: AsyncSession = Depends(get_session),
) -> SourceResponse:
    """Get a single source by ID."""
    stmt = select(ApplicationSource).where(ApplicationSource.id == source_id)
    result = await session.exec(stmt)
    source = result.first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    return SourceResponse.model_validate(source)


@router.patch(
    "/{source_id}",
    response_model=SourceResponse,
    summary="Update a source",
)
async def update_source(
    source_id: int,
    update: SourceUpdate,
    session: AsyncSession = Depends(get_session),
) -> SourceResponse:
    """Update a source's details."""
    stmt = select(ApplicationSource).where(ApplicationSource.id == source_id)
    result = await session.exec(stmt)
    source = result.first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(source, field, value)

    source.updated_at = datetime.utcnow()
    session.add(source)
    await session.commit()
    await session.refresh(source)

    return SourceResponse.model_validate(source)


@router.post(
    "/{source_id}/api-keys",
    response_model=ApiKeyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key for a source",
)
async def create_api_key(
    source_id: int,
    key_data: ApiKeyCreate,
    session: AsyncSession = Depends(get_session),
) -> ApiKeyResponse:
    """Generate a new API key for a source."""
    # Verify source exists
    stmt = select(ApplicationSource).where(ApplicationSource.id == source_id)
    result = await session.exec(stmt)
    source = result.first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    # Generate API key
    plain_key, key_hash = generate_api_key()

    api_key = ApiKey(
        source_id=source_id,
        key_hash=key_hash,
        name=key_data.name,
        description=key_data.description,
        is_active=True,
        expires_at=key_data.expires_at,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    # Return with plain key (only time it's shown)
    response = ApiKeyResponse.model_validate(api_key)
    response.plain_key = plain_key
    return response


@router.get(
    "/{source_id}/api-keys",
    response_model=ApiKeyListResponse,
    summary="List API keys for a source",
)
async def list_api_keys(
    source_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> ApiKeyListResponse:
    """List all API keys for a source (hashes only)."""
    # Verify source exists
    stmt = select(ApplicationSource).where(ApplicationSource.id == source_id)
    result = await session.exec(stmt)
    source = result.first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    stmt = select(ApiKey).where(ApiKey.source_id == source_id).offset(offset).limit(limit)
    count_stmt = select(func.count(ApiKey.id)).where(ApiKey.source_id == source_id)

    result = await session.exec(stmt)
    keys = list(result.all())

    count_result = await session.exec(count_stmt)
    total = count_result.one()

    return ApiKeyListResponse(
        keys=[ApiKeyResponse.model_validate(k) for k in keys],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/{source_id}/api-keys/{key_id}",
    response_model=ApiKeyResponse,
    summary="Update an API key",
)
async def update_api_key(
    source_id: int,
    key_id: int,
    update: ApiKeyUpdate,
    session: AsyncSession = Depends(get_session),
) -> ApiKeyResponse:
    """Update an API key's properties."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.source_id == source_id)
    result = await session.exec(stmt)
    api_key = result.first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(api_key, field, value)

    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return ApiKeyResponse.model_validate(api_key)


@router.delete(
    "/{source_id}/api-keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an API key",
)
async def revoke_api_key(
    source_id: int,
    key_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Revoke (deactivate) an API key."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.source_id == source_id)
    result = await session.exec(stmt)
    api_key = result.first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    api_key.is_active = False
    session.add(api_key)
    await session.commit()

    return
