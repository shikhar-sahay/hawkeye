"""Source and API key management API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete as sa_delete
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import (
    allow_source_registration,
    get_current_source,
    get_session,
    require_source_for_key_creation,
    require_source_ownership,
)
from hawkeye.core.auth import generate_api_key
from hawkeye.models.events import (
    Alert,
    ApiKey,
    ApplicationSource,
    Incident,
    IncidentAlert,
    NormalizedEvent,
    RawEvent,
)
from hawkeye.schemas import (
    ApiKeyCreate,
    ApiKeyListResponse,
    ApiKeyResponse,
    ApiKeyUpdate,
    SourceCreate,
    SourceEventCountsResponse,
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
    _guard: None = Depends(allow_source_registration),
    session: AsyncSession = Depends(get_session),
) -> SourceResponse:
    """Register a new application source.

    Open only while the deployment has no sources (bootstrap); afterwards
    a valid API key is required.
    """
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
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    _source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> SourceListResponse:
    """List all registered application sources."""
    stmt = select(ApplicationSource)
    count_stmt = select(func.count(ApplicationSource.id))

    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(
            ApplicationSource.name.ilike(search_term) |
            ApplicationSource.description.ilike(search_term)
        )
        count_stmt = count_stmt.where(
            ApplicationSource.name.ilike(search_term) |
            ApplicationSource.description.ilike(search_term)
        )

    if is_active is not None:
        stmt = stmt.where(ApplicationSource.is_active == is_active)
        count_stmt = count_stmt.where(ApplicationSource.is_active == is_active)

    stmt = stmt.offset(offset).limit(limit)

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
    "/event-counts",
    response_model=list[SourceEventCountsResponse],
    summary="Get event, alert, and incident counts per source",
)
async def get_source_event_counts(
    _source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> list[SourceEventCountsResponse]:
    """Get aggregated event, alert, and incident counts for all sources."""
    # Get all sources
    sources_stmt = select(ApplicationSource).order_by(ApplicationSource.id)
    sources_result = await session.exec(sources_stmt)
    sources = list(sources_result.all())

    # Aggregate counts per source with a single GROUP BY query per table
    # instead of one COUNT query per source per table (N+1).
    async def _counts_per_source(model: type) -> dict[int, int]:
        stmt = select(model.source_id, func.count(model.id)).group_by(model.source_id)
        rows = await session.exec(stmt)
        return {row[0]: row[1] for row in rows.all()}

    event_counts = await _counts_per_source(NormalizedEvent)
    alert_counts = await _counts_per_source(Alert)
    incident_counts = await _counts_per_source(Incident)

    return [
        SourceEventCountsResponse(
            source_id=source.id,
            source_name=source.name,
            event_count=event_counts.get(source.id, 0),
            alert_count=alert_counts.get(source.id, 0),
            incident_count=incident_counts.get(source.id, 0),
            is_active=source.is_active,
        )
        for source in sources
    ]


@router.get(
    "/{source_id}",
    response_model=SourceResponse,
    summary="Get a source by ID",
)
async def get_source(
    source_id: int,
    _source: ApplicationSource = Depends(require_source_ownership),
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


@router.delete(
    "/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a source and all of its data",
)
async def delete_source(
    source_id: int,
    _source: ApplicationSource = Depends(require_source_ownership),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete a source together with its API keys, events,
    alerts, and incidents. This cannot be undone."""
    stmt = select(ApplicationSource).where(ApplicationSource.id == source_id)
    result = await session.exec(stmt)
    source = result.first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )

    # Collect this source's alert ids so join-table rows can be removed
    alert_ids_stmt = select(Alert.id).where(Alert.source_id == source_id)
    alert_ids = list((await session.exec(alert_ids_stmt)).all())

    # 1. Incident <-> Alert join rows for the source's alerts
    if alert_ids:
        await session.execute(
            sa_delete(IncidentAlert).where(IncidentAlert.alert_id.in_(alert_ids))
        )

    # 2. Incidents owned by the source
    await session.execute(sa_delete(Incident).where(Incident.source_id == source_id))

    # 3. Alerts raised from the source's events
    await session.execute(sa_delete(Alert).where(Alert.source_id == source_id))

    # 4. Normalized events (alerts reference them via event_id, already gone)
    await session.execute(
        sa_delete(NormalizedEvent).where(NormalizedEvent.source_id == source_id)
    )

    # 5. Raw ingested events
    await session.execute(sa_delete(RawEvent).where(RawEvent.source_id == source_id))

    # 6. API keys
    await session.execute(sa_delete(ApiKey).where(ApiKey.source_id == source_id))

    # 7. The source itself
    await session.delete(source)
    await session.commit()

    return


@router.patch(
    "/{source_id}",
    response_model=SourceResponse,
    summary="Update a source",
)
async def update_source(
    source_id: int,
    update: SourceUpdate,
    _source: ApplicationSource = Depends(require_source_ownership),
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
    source: ApplicationSource = Depends(require_source_for_key_creation),
    session: AsyncSession = Depends(get_session),
) -> ApiKeyResponse:
    """Generate a new API key for a source.

    Open (no key required) only while the deployment has zero API keys
    (bootstrap); afterwards a valid API key is required.
    """
    # The auth dependency already verified the source exists
    _ = source

    # Generate API key
    plain_key, key_hash = generate_api_key()
    key_prefix = plain_key.split("_")[0] + "_" if "_" in plain_key else plain_key[:8]

    api_key = ApiKey(
        source_id=source_id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=key_data.name,
        description=key_data.description,
        is_active=True,
        expires_at=key_data.expires_at,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    # Return with plain key (only time it's shown) and key_prefix for display
    response = ApiKeyResponse.model_validate(api_key)
    response.plain_key = plain_key
    response.key_prefix = key_prefix
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
    _source: ApplicationSource = Depends(require_source_ownership),
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
    _source: ApplicationSource = Depends(require_source_ownership),
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
    _source: ApplicationSource = Depends(require_source_ownership),
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
