"""Tests for the fresh-install bootstrap flow (first source + first API key)."""

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
    """App with every session dependency overridden to an empty in-memory DB.

    Note: routes use `hawkeye.api.deps.get_session` (a thin wrapper) while the
    auth guards call `hawkeye.database.get_session` directly, so both callables
    must be overridden. StaticPool keeps the single :memory: database shared.
    """
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


@pytest.mark.asyncio
async def test_fresh_install_can_mint_first_credential(client):
    """A fresh install must be able to register a source and create its
    first API key without any pre-existing credential."""
    # Register the first source (bootstrap, no key)
    r = await client.post(
        "/api/v1/sources",
        json={"name": "production-web", "description": "Fresh install"},
    )
    assert r.status_code == 201, r.text
    source_id = r.json()["id"]

    # Create the first API key (bootstrap, no key)
    r = await client.post(
        f"/api/v1/sources/{source_id}/api-keys",
        json={"name": "dashboard"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body.get("plain_key") or body.get("api_key"), body

    api_key = body.get("plain_key") or body.get("api_key")

    # The new key authenticates
    r = await client.get(
        "/api/v1/sources?limit=1",
        headers={"X-API-Key": api_key},
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1


@pytest.mark.asyncio
async def test_bootstrap_closes_after_first_key_exists(client):
    """Once a key exists, source registration and key creation require auth."""
    r = await client.post("/api/v1/sources", json={"name": "s1"})
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k1"})
    assert r.status_code == 201
    api_key = r.json().get("plain_key") or r.json().get("api_key")

    # Second source without a key -> rejected
    r = await client.post("/api/v1/sources", json={"name": "s2"})
    assert r.status_code == 401

    # Second key without a key -> rejected
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k2"})
    assert r.status_code == 401

    # With the key, both work again
    headers = {"X-API-Key": api_key}
    r = await client.post("/api/v1/sources", json={"name": "s2"}, headers=headers)
    assert r.status_code == 201
    r = await client.post(
        "/api/v1/sources/2/api-keys", json={"name": "k2"}, headers=headers
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_invalid_key_is_rejected(client):
    """Login validation against a fresh backend rejects unknown keys."""
    await client.post("/api/v1/sources", json={"name": "s1"})
    r = await client.get(
        "/api/v1/sources?limit=1", headers={"X-API-Key": "hawk_not_a_real_key"}
    )
    assert r.status_code == 401
