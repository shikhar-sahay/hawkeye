"""Tests for API key expiry enforcement (REST and WebSocket)."""

import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

import hawkeye.api.deps as deps
from hawkeye.database import get_session as db_get_session
from hawkeye.main import app


@pytest.fixture
async def fresh_app() -> FastAPI:
    """App with every session dependency overridden to an empty in-memory DB."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override():
        async with factory() as session:
            yield session

    app.dependency_overrides[deps.get_session] = override
    app.dependency_overrides[db_get_session] = override
    yield app
    app.dependency_overrides.pop(deps.get_session, None)
    app.dependency_overrides.pop(db_get_session, None)
    await engine.dispose()


@pytest.fixture
async def client(fresh_app: FastAPI):
    transport = ASGITransport(app=fresh_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _plain_key(body: dict) -> str:
    return body.get("plain_key") or body.get("api_key")


@pytest.fixture
async def keys(client):
    """Returns (expired_key, valid_key) for source 1."""
    from hawkeye.core.auth import generate_api_key
    from hawkeye.models.events import ApiKey

    r = await client.post("/api/v1/sources", json={"name": "s1"})
    assert r.status_code == 201
    # First key (bootstrap, no credentials): already expired at creation
    past = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    r = await client.post(
        "/api/v1/sources/1/api-keys", json={"name": "old", "expires_at": past}
    )
    assert r.status_code == 201, r.text
    expired = _plain_key(r.json())
    # The expired key cannot authenticate, so it cannot mint the second key
    # via the API (this itself proves expiry on the management plane).
    # Seed a valid key directly instead.
    plain, key_hash = generate_api_key()
    gen = app.dependency_overrides[db_get_session]()
    session = await gen.__anext__()
    try:
        session.add(
            ApiKey(
                source_id=1,
                key_hash=key_hash,
                key_prefix="hawk_",
                name="valid",
                is_active=True,
                expires_at=datetime.utcnow() + timedelta(days=30),
            )
        )
        await session.commit()
    finally:
        await gen.aclose()
    return expired, plain


@pytest.mark.asyncio
async def test_expired_key_rejected_on_rest(client, keys):
    expired, valid = keys
    r = await client.get("/api/v1/sources?limit=1", headers={"X-API-Key": expired})
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_valid_key_accepted_on_rest(client, keys):
    _, valid = keys
    r = await client.get("/api/v1/sources?limit=1", headers={"X-API-Key": valid})
    assert r.status_code == 200


def test_expired_key_rejected_on_websocket():
    """Expired keys must not establish WebSocket connections.

    Exercises get_ws_source directly (no TestClient portal): the Starlette
    TestClient portal teardown hangs intermittently on Windows when mixed
    with the global engine, so WS auth is asserted at the dependency level.
    """
    import asyncio
    from unittest.mock import AsyncMock

    from fastapi import WebSocketException

    from hawkeye.api.websocket import get_ws_source
    from hawkeye.core.auth import generate_api_key
    from hawkeye.models.events import ApiKey, ApplicationSource

    async def scenario():
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            poolclass=StaticPool,
        )
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            session.add(ApplicationSource(id=1, name="ws-src", description="ws"))
            await session.commit()
            plain, key_hash = generate_api_key()
            session.add(
                ApiKey(
                    source_id=1,
                    key_hash=key_hash,
                    key_prefix="hawk_",
                    name="expired-ws",
                    is_active=True,
                    expires_at=datetime.utcnow() - timedelta(minutes=5),
                )
            )
            await session.commit()

            websocket = AsyncMock()
            websocket.headers = {"x-api-key": plain}
            with pytest.raises(WebSocketException):
                await get_ws_source(websocket, None, session)
            websocket.close.assert_called()

            # Sanity: a fresh key with future expiry authenticates
            plain2, hash2 = generate_api_key()
            session.add(
                ApiKey(
                    source_id=1,
                    key_hash=hash2,
                    key_prefix="hawk_",
                    name="valid-ws",
                    is_active=True,
                    expires_at=datetime.utcnow() + timedelta(days=1),
                )
            )
            await session.commit()
            websocket2 = AsyncMock()
            websocket2.headers = {"x-api-key": plain2}
            source = await get_ws_source(websocket2, None, session)
            assert source.id == 1
        await engine.dispose()

    asyncio.run(scenario())
