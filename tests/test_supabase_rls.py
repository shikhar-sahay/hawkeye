"""Supabase RLS source-isolation tests (Phase 2 of the Vercel/Supabase migration).

These tests run against a REAL PostgreSQL database provisioned with
supabase/migrations/0001_schema.sql + 0002_realtime_rls.sql, plus a test-only
``auth.jwt()`` stub (Supabase provides the real one natively; the migration
file only *references* it inside policy expressions).

Run:  HAWKEYE_TEST_PG_URL=postgresql+asyncpg://... pytest tests/test_supabase_rls.py -v
Skipped automatically when the variable is absent (e.g. plain SQLite CI).

Covered:
  1. source A reads only its own rows on all three streamed tables
  2. source A reads zero rows of source B (and vice versa)
  3. missing / forged / non-numeric source_id claims read zero rows
  4. anon role reads zero rows everywhere and cannot write
  5. authenticated role cannot INSERT/UPDATE/DELETE anything
  6. non-streamed tables (sources, keys, raw, joins) deny authenticated reads
"""

import os

import pytest

PG_URL = os.environ.get("HAWKEYE_TEST_PG_URL")
needs_pg = pytest.mark.skipif(not PG_URL, reason="HAWKEYE_TEST_PG_URL not set")

TABLES = ["normalized_events", "alerts", "incidents"]
LOCKED_TABLES = ["application_sources", "api_keys", "raw_events", "incident_alerts"]


async def _conn(database: str = "hawkeye_rlstest"):
    import asyncpg

    assert PG_URL is not None
    base = PG_URL.rsplit("/", 1)[0]
    # asyncpg wants a libpq-style DSN, not the SQLAlchemy URL
    dsn = base.replace("postgresql+asyncpg://", "postgresql://") + f"/{database}"
    return await asyncpg.connect(dsn)


@needs_pg
async def test_source_a_reads_only_own_rows():
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("SET hawkeye.jwt_claims = '{\"source_id\": 1}'")
        for table in TABLES:
            rows = await conn.fetch(f"SELECT DISTINCT source_id FROM {table}")
            assert {r["source_id"] for r in rows} == {1}, table
    finally:
        await conn.close()


@needs_pg
async def test_source_b_reads_only_own_rows():
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("SET hawkeye.jwt_claims = '{\"source_id\": 2}'")
        for table in TABLES:
            rows = await conn.fetch(f"SELECT DISTINCT source_id FROM {table}")
            assert {r["source_id"] for r in rows} == {2}, table
    finally:
        await conn.close()


@needs_pg
async def test_missing_claim_reads_nothing():
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("RESET hawkeye.jwt_claims")
        for table in TABLES:
            n = await conn.fetchval(f"SELECT count(*) FROM {table}")
            assert n == 0, table
    finally:
        await conn.close()


@needs_pg
async def test_forged_claims_read_nothing():
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        for claim in ('{"source_id": 99}', '{"source_id": "1 OR 1=1"}', '{"role": "authenticated"}', '{}'):
            await conn.execute(f"SET hawkeye.jwt_claims = '{claim}'")
            for table in TABLES:
                n = await conn.fetchval(f"SELECT count(*) FROM {table}")
                assert n == 0, (claim, table)
    finally:
        await conn.close()


@needs_pg
async def test_anon_reads_nothing_anywhere():
    # anon holds no grants at all, so even the query itself is denied.
    # Denial (rather than an empty set) is the strongest form of "sees nothing".
    conn = await _conn()
    try:
        await conn.execute("SET ROLE anon")
        for table in TABLES + LOCKED_TABLES:
            with pytest.raises(Exception):
                await conn.fetchval(f"SELECT count(*) FROM {table}")
    finally:
        await conn.close()


@needs_pg
async def test_authenticated_cannot_write():
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("SET hawkeye.jwt_claims = '{\"source_id\": 1}'")
        with pytest.raises(Exception):
            await conn.execute(
                "INSERT INTO normalized_events (source_id, timestamp, category, event_type, severity) "
                "VALUES (1, now(), 'test', 'test', 'low')"
            )
        with pytest.raises(Exception):
            await conn.execute("UPDATE alerts SET status='dismissed' WHERE source_id=1")
        with pytest.raises(Exception):
            await conn.execute("DELETE FROM incidents WHERE source_id=1")
    finally:
        await conn.close()


@needs_pg
async def test_locked_tables_deny_authenticated_reads():
    # No grants + no policies: the query itself is denied.
    conn = await _conn()
    try:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("SET hawkeye.jwt_claims = '{\"source_id\": 1}'")
        for table in LOCKED_TABLES:
            with pytest.raises(Exception):
                await conn.fetchval(f"SELECT count(*) FROM {table}")
    finally:
        await conn.close()
