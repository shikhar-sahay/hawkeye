"""Vercel serverless entrypoint tests (Phase 4+6 of the migration).

api/index.py exports the existing FastAPI `app` unchanged (Vercel's Python
runtime serves it natively; no adapter). These tests exercise every REST
endpoint through that exact object with an ASGI transport, against an
isolated in-memory SQLite DB — the same code path Vercel invokes.

Covered: health/root, bootstrap, key lifecycle, all list/detail endpoints,
stats/time-series/mitre, status updates, ingestion single+batch, realtime
token, 404s, auth failures, serverless lifespan flags (no create_all side
effects needed, no heartbeat task), and the batch timeout envelope (Phase 6).
"""

import json
import time

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

import hawkeye.api.deps as deps
from hawkeye.api.websocket import connection_manager
from hawkeye.database import get_session as db_get_session

from api.index import app


@pytest.fixture
async def serverless_app() -> FastAPI:
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
async def client(serverless_app: FastAPI):
    transport = ASGITransport(app=serverless_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def test_vercel_handler_exports_app():
    """api/index.py must export the FastAPI app object Vercel expects,
    with the full v1 route table intact (via OpenAPI, robust to the
    router's lazy internal representation)."""
    from fastapi import FastAPI as FA

    assert isinstance(app, FA)
    paths = sorted(app.openapi()["paths"])
    for expected in (
        "/api/v1/events",
        "/api/v1/events/batch",
        "/api/v1/events/query",
        "/api/v1/alerts",
        "/api/v1/incidents",
        "/api/v1/sources",
        "/api/v1/realtime-token",
    ):
        assert expected in paths, expected


@pytest.mark.asyncio
async def test_serverless_lifespan_skips_create_and_heartbeat(monkeypatch):
    """With serverless flags, lifespan must not touch the DB schema or
    start the heartbeat task. Without flags (local), behavior is unchanged."""
    import hawkeye.main as main_mod

    monkeypatch.setenv("HAWKEYE_SKIP_CREATE_ALL", "1")
    monkeypatch.setenv("HAWKEYE_DISABLE_HEARTBEAT", "1")
    import importlib

    importlib.reload(main_mod)
    try:
        created, started = [], []

        async def fake_create():
            created.append(True)

        async def fake_start():
            started.append(True)

        monkeypatch.setattr(main_mod.db, "create_all", fake_create)
        monkeypatch.setattr(main_mod.connection_manager, "start", fake_start)
        async with main_mod.lifespan(main_mod.app):
            pass
        assert created == [] and started == []
    finally:
        importlib.reload(main_mod)


@pytest.mark.asyncio
async def test_health_and_root(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
    r = await client.get("/")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_full_api_surface_through_entrypoint(client, monkeypatch):
    import hawkeye.config as config_mod

    monkeypatch.setattr(
        config_mod.settings, "supabase_jwt_secret", "test-jwt-secret-min-32-chars!!"
    )

    # Bootstrap source + key (no credentials)
    r = await client.post("/api/v1/sources", json={"name": "vercel-src"})
    assert r.status_code == 201, r.text
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k"})
    assert r.status_code == 201, r.text
    key = r.json().get("plain_key") or r.json().get("api_key")
    h = {"X-API-Key": key}

    # Sources
    assert (await client.get("/api/v1/sources", headers=h)).status_code == 200
    assert (await client.get("/api/v1/sources/1", headers=h)).status_code == 200
    assert (await client.get("/api/v1/sources/event-counts", headers=h)).status_code == 200
    # Keys
    assert (await client.get("/api/v1/sources/1/api-keys", headers=h)).status_code == 200
    # Realtime token
    r = await client.post("/api/v1/realtime-token", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["source_id"] == 1

    # Ingest single event
    ev = {
        "event_type": "login_failed",
        "user_id": "vercel_user",
        "ip": "198.51.100.9",
        "route": "/login",
        "method": "POST",
        "status_code": 401,
    }
    r = await client.post("/api/v1/events", json=ev, headers=h)
    assert r.status_code == 202, r.text

    # Events query + detail + event alerts
    r = await client.get("/api/v1/events/query", params={"search": "vercel_user", "limit": 5}, headers=h)
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert (await client.get("/api/v1/events/1", headers=h)).status_code == 200
    assert (await client.get("/api/v1/events/1/alerts", headers=h)).status_code == 200

    # Alerts list/stats/mitre/time-series/detail
    assert (await client.get("/api/v1/alerts", headers=h)).status_code == 200
    assert (await client.get("/api/v1/alerts/stats", headers=h)).status_code == 200
    assert (await client.get("/api/v1/alerts/mitre-coverage", headers=h)).status_code == 200
    r = await client.get("/api/v1/alerts/time-series", params={"hours": 24}, headers=h)
    assert r.status_code == 200

    # Incidents list/stats
    assert (await client.get("/api/v1/incidents", headers=h)).status_code == 200
    assert (await client.get("/api/v1/incidents/stats", headers=h)).status_code == 200

    # Auth failures
    bad = {"X-API-Key": "hawk_nope"}
    assert (await client.get("/api/v1/sources", headers=bad)).status_code == 401
    assert (await client.get("/api/v1/alerts/1", headers=bad)).status_code == 401
    # 404s
    assert (await client.get("/api/v1/alerts/999", headers=h)).status_code == 404
    assert (await client.get("/api/v1/incidents/999", headers=h)).status_code == 404
    assert (await client.get("/api/v1/events/999", headers=h)).status_code == 404
    assert (await client.get("/nope", headers=h)).status_code == 404

    # Heartbeat must NOT be running: serverless has no lifespan
    task = connection_manager._heartbeat_task
    assert task is None or task.done()


@pytest.mark.asyncio
async def test_detection_pipeline_through_entrypoint(client):
    """6 rapid failures -> brute-force alert + incident, same code path."""
    r = await client.post("/api/v1/sources", json={"name": "bf-src"})
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k"})
    key = r.json().get("plain_key") or r.json().get("api_key")
    h = {"X-API-Key": key}
    for i in range(6):
        ev = {
            "event_type": "login_failed",
            "user_id": "bf_user",
            "ip": f"198.51.100.{10 + i}",
            "route": "/login",
            "method": "POST",
            "status_code": 401,
        }
        r = await client.post("/api/v1/events", json=ev, headers=h)
        assert r.status_code == 202, r.text
    r = await client.get("/api/v1/alerts", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    alert_id = r.json()["alerts"][0]["id"]
    r = await client.patch(f"/api/v1/alerts/{alert_id}", json={"status": "processing"}, headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "processing"
    r = await client.get("/api/v1/incidents", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    incident_id = r.json()["incidents"][0]["id"]
    r = await client.patch(
        f"/api/v1/incidents/{incident_id}/status", json={"status": "investigating"}, headers=h
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_batch_ingest_timeout_envelope(client):
    """Phase 6: the 50-event cap must fit the serverless timeout envelope,
    and oversized batches must be rejected with 422 (not time out)."""
    r = await client.post("/api/v1/sources", json={"name": "batch-src"})
    assert r.status_code == 201
    r = await client.post("/api/v1/sources/1/api-keys", json={"name": "k"})
    key = r.json().get("plain_key") or r.json().get("api_key")
    h = {"X-API-Key": key}

    def make_batch(n):
        return {
            "events": [
                {
                    "event_type": "request",
                    "user_id": f"u{i % 10}",
                    "ip": "198.51.100.5",
                    "route": "/api/data",
                    "method": "GET",
                    "status_code": 200,
                }
                for i in range(n)
            ]
        }

    start = time.perf_counter()
    r = await client.post("/api/v1/events/batch", json=make_batch(50), headers=h)
    elapsed = time.perf_counter() - start
    assert r.status_code == 202, r.text
    print(f"\n[batch-envelope] 50 events in {elapsed:.2f}s")
    assert elapsed < 8.0, "50-event batch leaves no margin under the 10s serverless timeout"

    r = await client.post("/api/v1/events/batch", json=make_batch(51), headers=h)
    assert r.status_code == 422
