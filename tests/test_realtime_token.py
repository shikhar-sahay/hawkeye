"""Tests for POST /api/v1/realtime-token (Phase 3 of Vercel/Supabase migration).

The endpoint preserves the API-key model: it validates the caller's HawkEye
key with existing auth logic and mints a short-lived JWT whose source_id is
derived server-side only. Covers valid/invalid/expired keys, unconfigured
secret (503), uninfluencable source_id, and forged-token rejection.
"""

import time

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

import hawkeye.api.deps as deps
import hawkeye.config as config_mod
from hawkeye.database import get_session as db_get_session
from hawkeye.main import app

TEST_SECRET = "test-supabase-jwt-secret-min-32-chars!!"


@pytest.fixture
async def fresh_app() -> FastAPI:
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
    old_secret = config_mod.settings.supabase_jwt_secret
    config_mod.settings.supabase_jwt_secret = TEST_SECRET
    yield app
    config_mod.settings.supabase_jwt_secret = old_secret
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
async def api_key(client):
    r = await client.post("/api/v1/sources", json={"name": "rt-src"})
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "rt-key"})
    assert r.status_code == 201
    return _plain_key(r.json())


@pytest.mark.asyncio
async def test_valid_key_mints_scoped_token(client, api_key):
    from jose import jwt

    r = await client.post(
        "/api/v1/realtime-token", headers={"X-API-Key": api_key}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source_id"] == 1
    assert body["expires_in"] == config_mod.settings.realtime_token_ttl_seconds
    claims = jwt.decode(body["token"], TEST_SECRET, algorithms=["HS256"])
    assert claims["source_id"] == 1
    assert claims["role"] == "authenticated"
    assert claims["exp"] - claims["iat"] == config_mod.settings.realtime_token_ttl_seconds
    assert claims["exp"] > int(time.time())


@pytest.mark.asyncio
async def test_invalid_key_rejected(client):
    r = await client.post(
        "/api/v1/realtime-token", headers={"X-API-Key": "hawk_nope"}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_missing_key_rejected(client):
    r = await client.post("/api/v1/realtime-token")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_expired_key_rejected(client, api_key):
    # Expire the key directly, then minting must fail
    from hawkeye.models.events import ApiKey
    from sqlmodel import select
    from datetime import datetime, timedelta

    gen = app.dependency_overrides[db_get_session]()
    session = await gen.__anext__()
    try:
        res = await session.exec(select(ApiKey))
        key = res.first()
        key.expires_at = datetime.utcnow() - timedelta(minutes=1)
        session.add(key)
        await session.commit()
    finally:
        await gen.aclose()
    r = await client.post(
        "/api/v1/realtime-token", headers={"X-API-Key": api_key}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_source_id_cannot_be_influenced(client, api_key):
    # The endpoint takes no parameters: query/body attempts must not change
    # the server-derived claim (body even 422s, which is fine).
    r = await client.post(
        "/api/v1/realtime-token?source_id=999", headers={"X-API-Key": api_key}
    )
    assert r.status_code == 200
    assert r.json()["source_id"] == 1


@pytest.mark.asyncio
async def test_unconfigured_secret_returns_503(client, api_key, monkeypatch):
    monkeypatch.setattr(config_mod.settings, "supabase_jwt_secret", None)
    r = await client.post(
        "/api/v1/realtime-token", headers={"X-API-Key": api_key}
    )
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_forged_token_rejected():
    from jose import JWTError, jwt

    from hawkeye.api.v1.realtime import mint_realtime_token

    # Sanity: a token minted for source 1 verifies under the real secret
    old = config_mod.settings.supabase_jwt_secret
    config_mod.settings.supabase_jwt_secret = TEST_SECRET
    try:
        token, _ = mint_realtime_token(1)
    finally:
        config_mod.settings.supabase_jwt_secret = old
    assert jwt.decode(token, TEST_SECRET, algorithms=["HS256"])["source_id"] == 1
    # Same payload re-signed with the wrong secret must not verify
    bad = jwt.encode(
        {"role": "authenticated", "source_id": 2, "iat": 1, "exp": 9999999999},
        "wrong-secret",
        algorithm="HS256",
    )
    with pytest.raises(JWTError):
        jwt.decode(bad, TEST_SECRET, algorithms=["HS256"])


@pytest.mark.asyncio
async def test_token_claims_match_rls_contract(client, api_key):
    """Composition contract with tests/test_supabase_rls.py: the minted JWT
    must carry an integer source_id claim under role "authenticated", which
    is exactly what the RLS policies compare (source_id::text = claim)."""
    from jose import jwt

    r = await client.post(
        "/api/v1/realtime-token", headers={"X-API-Key": api_key}
    )
    assert r.status_code == 200
    claims = jwt.decode(r.json()["token"], TEST_SECRET, algorithms=["HS256"])
    assert set(claims) == {"role", "source_id", "iat", "exp"}
    assert claims["role"] == "authenticated"
    assert isinstance(claims["source_id"], int) and claims["source_id"] == 1
