"""Tests for source-ownership authorization on management endpoints.

A source's API key may only manage its own source and keys. Cross-source
access must fail with 404 (not 403, to avoid confirming existence).
The only exception is minting the FIRST key of a keyless source (onboarding).
"""

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
async def two_sources(client):
    """Two sources, each with its own key. Returns (key_a, key_b)."""
    # Bootstrap source 1 + first key (no credentials)
    r = await client.post("/api/v1/sources", json={"name": "s1"})
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k1"})
    assert r.status_code == 201
    key_a = _plain_key(r.json())
    headers_a = {"X-API-Key": key_a}

    # Source 2 created by key A; first key of source 2 minted by key A
    # (onboarding carve-out: source 2 has no keys yet)
    r = await client.post("/api/v1/sources", json={"name": "s2"}, headers=headers_a)
    assert r.status_code == 201
    r = await client.post(
        "/api/v1/sources/2/api-keys", json={"name": "k2"}, headers=headers_a
    )
    assert r.status_code == 201, r.text
    key_b = _plain_key(r.json())
    return key_a, key_b


@pytest.mark.asyncio
async def test_owner_can_manage_own_source_and_keys(client, two_sources):
    key_a, _ = two_sources
    h = {"X-API-Key": key_a}
    assert (await client.get("/api/v1/sources/1", headers=h)).status_code == 200
    assert (
        await client.patch(
            "/api/v1/sources/1", json={"description": "mine"}, headers=h
        )
    ).status_code == 200
    assert (await client.get("/api/v1/sources/1/api-keys", headers=h)).status_code == 200
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k-extra"}, headers=h)
    assert r.status_code == 201
    key_id = r.json()["id"]
    assert (
        await client.patch(
            f"/api/v1/sources/1/api-keys/{key_id}",
            json={"description": "rotated"},
            headers=h,
        )
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/sources/1/api-keys/{key_id}", headers=h)
    ).status_code == 204


@pytest.mark.asyncio
async def test_cross_source_source_access_is_404(client, two_sources):
    key_a, key_b = two_sources
    ha, hb = {"X-API-Key": key_a}, {"X-API-Key": key_b}
    # A reads/writes/deletes B -> 404
    assert (await client.get("/api/v1/sources/2", headers=ha)).status_code == 404
    assert (
        await client.patch("/api/v1/sources/2", json={"description": "x"}, headers=ha)
    ).status_code == 404
    assert (await client.delete("/api/v1/sources/2", headers=ha)).status_code == 404
    # And symmetrically B against A
    assert (await client.get("/api/v1/sources/1", headers=hb)).status_code == 404
    assert (await client.delete("/api/v1/sources/1", headers=hb)).status_code == 404


@pytest.mark.asyncio
async def test_cross_source_key_access_is_404(client, two_sources):
    key_a, key_b = two_sources
    ha, hb = {"X-API-Key": key_a}, {"X-API-Key": key_b}
    # A lists/mints/revokes B's keys -> 404
    assert (await client.get("/api/v1/sources/2/api-keys", headers=ha)).status_code == 404
    assert (
        await client.post("/api/v1/sources/2/api-keys", json={"name": "evil"}, headers=ha)
    ).status_code == 404
    # B's key id 2 exists; A must not touch it (path source 2 is not A's)
    assert (await client.delete("/api/v1/sources/2/api-keys/2", headers=ha)).status_code == 404
    assert (
        await client.patch(
            "/api/v1/sources/2/api-keys/2", json={"description": "x"}, headers=ha
        )
    ).status_code == 404
    # Symmetric check for B against A's key id 1
    assert (await client.delete("/api/v1/sources/1/api-keys/1", headers=hb)).status_code == 404


@pytest.mark.asyncio
async def test_first_key_onboarding_then_closed(client, two_sources):
    key_a, _ = two_sources
    ha = {"X-API-Key": key_a}
    # New source 3 has no keys: key A may mint its first key (onboarding)
    r = await client.post("/api/v1/sources", json={"name": "s3"}, headers=ha)
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/3/api-keys", json={"name": "k3"}, headers=ha)
    assert r.status_code == 201, r.text
    key_c = _plain_key(r.json())
    # Window closed: key A can no longer mint keys for source 3...
    r = await client.post("/api/v1/sources/3/api-keys", json={"name": "k4"}, headers=ha)
    assert r.status_code == 404
    # ...and cannot read it either, while the new owner key C can manage it
    assert (await client.get("/api/v1/sources/3", headers=ha)).status_code == 404
    hc = {"X-API-Key": key_c}
    assert (await client.get("/api/v1/sources/3", headers=hc)).status_code == 200
    r = await client.post("/api/v1/sources/3/api-keys", json={"name": "k4"}, headers=hc)
    assert r.status_code == 201
