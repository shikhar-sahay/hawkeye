"""Tests for the ingestion pipeline."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.services.ingestion_service import IngestionService
from hawkeye.schemas.ingestion import RawEventIngest, BatchEventsIngest
from hawkeye.models.events import ApplicationSource, NormalizedEvent, RawEvent


def _mock_session_with_ids():
    """Create a mock session that assigns IDs on flush."""
    session = AsyncMock(spec=AsyncSession)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    # Track added objects and assign IDs on flush
    added_objects = []
    add_called = False
    add_all_called = False

    def mock_add(obj):
        nonlocal add_called
        add_called = True
        added_objects.append(obj)

    def mock_add_all(objs):
        nonlocal add_all_called
        add_all_called = True
        added_objects.extend(objs)

    async def mock_flush():
        # Assign sequential IDs to un-ID'd objects
        for i, obj in enumerate(added_objects):
            if not hasattr(obj, 'id') or obj.id is None:
                obj.id = i + 1

    session.add = mock_add
    session.add_all = mock_add_all
    session.flush = mock_flush
    # Add called properties for assertions
    session.add.called = lambda: add_called
    session.add_all.called = lambda: add_all_called
    return session


class TestIngestionService:
    """Tests for the IngestionService."""

    @pytest.fixture
    def session(self):
        return _mock_session_with_ids()

    @pytest.fixture
    def source(self):
        return ApplicationSource(
            id=1,
            name="test-app",
            api_key="test-key",
            is_active=True,
        )

    @pytest.fixture
    def event(self):
        return RawEventIngest(
            timestamp=datetime.utcnow(),
            event_type="login_failed",
            category="authentication",
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            user_id="testuser",
            route="/login",
            method="POST",
            status_code=401,
            metadata={"attempt": 1},
        )

    @pytest.mark.asyncio
    async def test_ingest_event_creates_raw_and_normalized(self, session, source, event):
        """Test that ingesting an event creates both raw and normalized records."""
        service = IngestionService(session)

        with patch.object(service.detection_engine, "process_event", new_callable=AsyncMock) as mock_detect:
            normalized = await service.ingest_event(event, source)

        assert normalized is not None
        assert normalized.source_id == source.id
        assert normalized.ip == event.ip
        assert normalized.user_id == event.user_id
        assert normalized.raw_event_id is not None
        assert mock_detect.called

    @pytest.mark.asyncio
    async def test_ingest_batch_creates_multiple_events(self, session, source):
        """Test batch ingestion creates multiple events."""
        events = [
            RawEventIngest(
                timestamp=datetime.utcnow(),
                event_type="request",
                category="api",
                ip=f"192.168.1.{i}",
                user_agent="Mozilla/5.0",
                route="/api/test",
                method="GET",
                status_code=200,
            )
            for i in range(5)
        ]
        batch = BatchEventsIngest(events=events)

        service = IngestionService(session)

        with patch.object(service.detection_engine, "process_event", new_callable=AsyncMock):
            normalized_events, event_ids = await service.ingest_batch(batch, source)

        assert len(normalized_events) == 5
        assert len(event_ids) == 5
        assert session.add_all.called
        assert session.commit.called


class TestNormalizationEngine:
    """Tests for the NormalizationEngine."""

    @pytest.fixture
    def engine(self):
        from hawkeye.core.normalization import NormalizationEngine
        return NormalizationEngine()

    def test_normalize_basic_event(self, engine):
        """Test basic event normalization."""
        event = RawEventIngest(
            timestamp=datetime.utcnow(),
            event_type="login_failed",
            category="authentication",
            ip="192.168.1.1",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            user_id="testuser",
            route="/login",
            method="POST",
            status_code=401,
            metadata={"reason": "invalid_password"},
        )

        normalized = engine.normalize(event, source_id=1)

        assert normalized.event_type == "login_failed"
        assert normalized.category == "authentication"
        assert normalized.ip == "192.168.1.1"
        assert normalized.user_id == "testuser"
        assert normalized.route == "/login"
        assert normalized.method == "POST"
        assert normalized.status_code == 401
        assert normalized.severity == "medium"
        assert normalized.source_id == 1

    def test_normalize_sets_mitre_tags(self, engine):
        """Test that MITRE tags are set for known event types."""
        event = RawEventIngest(
            timestamp=datetime.utcnow(),
            event_type="login_failed",
            category="authentication",
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            route="/login",
            method="POST",
            status_code=401,
        )

        normalized = engine.normalize(event, source_id=1)

        assert "TA0006" in normalized.mitre_tactic  # Credential Access
        assert "T1110" in normalized.mitre_technique  # Brute Force

    def test_normalize_batch(self, engine):
        """Test batch normalization."""
        events = [
            RawEventIngest(
                timestamp=datetime.utcnow(),
                event_type="request",
                category="api",
                ip=f"10.0.0.{i}",
                user_agent="Mozilla/5.0",
                route="/api/data",
                method="GET",
                status_code=200,
            )
            for i in range(10)
        ]

        results = engine.normalize_batch(events, source_id=1)

        assert len(results) == 10
        for normalized, raw in results:
            assert normalized.source_id == 1
            assert isinstance(normalized, NormalizedEvent)


class TestIngestionSchemas:
    """Tests for ingestion Pydantic schemas."""

    def test_raw_event_ingest_validation(self):
        """Test RawEventIngest schema validation."""
        event = RawEventIngest(
            timestamp=datetime.utcnow(),
            event_type="login",
            category="authentication",
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            route="/login",
            method="POST",
            status_code=200,
        )
        assert event.ip == "192.168.1.1"

    def test_batch_events_ingest_validation(self):
        """Test BatchEventsIngest schema."""
        events = [
            RawEventIngest(
                timestamp=datetime.utcnow(),
                event_type="request",
                category="api",
                ip="10.0.0.1",
                user_agent="test",
                route="/api/test",
                method="GET",
                status_code=200,
            )
            for _ in range(3)
        ]
        batch = BatchEventsIngest(events=events)
        assert len(batch.events) == 3

    def test_batch_events_empty_rejected(self):
        """Test that empty batch is rejected."""
        with pytest.raises(Exception):
            BatchEventsIngest(events=[])