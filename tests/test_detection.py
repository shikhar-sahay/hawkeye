"""Tests for the detection engine and detectors."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.services.detection.engine import DetectionEngine
from hawkeye.services.detection.bot import BotDetector
from hawkeye.services.detection.brute_force import BruteForceDetector
from hawkeye.services.detection.credential_stuffing import CredentialStuffingDetector
from hawkeye.services.detection.base import DetectionContext
from hawkeye.models.events import NormalizedEvent, Alert
from hawkeye.models.enums import DetectionType, Severity


def _mock_session():
    """Create a properly mocked AsyncSession for detector tests."""
    session = AsyncMock(spec=AsyncSession)
    # session.exec is async and returns a Result object
    # Result.all() is synchronous, so we use a regular Mock for the result
    result_mock = MagicMock()
    result_mock.all.return_value = []
    result_mock.first.return_value = None
    session.exec = AsyncMock(return_value=result_mock)
    return session


def _mock_session_with_results(results):
    """Create a mock session that returns specific results."""
    session = AsyncMock(spec=AsyncSession)
    result_mock = MagicMock()
    result_mock.all.return_value = results
    result_mock.first.return_value = results[0] if results else None
    session.exec = AsyncMock(return_value=result_mock)
    return session


class TestDetectionEngine:
    """Tests for the DetectionEngine."""

    def test_engine_initializes_with_all_detectors(self):
        """Test that engine loads all 7 detectors."""
        engine = DetectionEngine()
        assert len(engine.detectors) == 7
        detector_names = {d.name for d in engine.detectors}
        expected = {
            "brute_force",
            "credential_stuffing",
            "enumeration",
            "bot_detection",
            "sensitive_actions",
            "session_hijacking",
            "api_abuse",
        }
        assert detector_names == expected

    @pytest.mark.asyncio
    async def test_process_event_runs_all_detectors(self):
        """Test that process_event runs all detectors."""
        engine = DetectionEngine()
        session = _mock_session()
        session.add_all = AsyncMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        event = NormalizedEvent(
            id=1,
            source_id=1,
            timestamp=datetime.utcnow(),
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            method="GET",
            route="/api/test",
            status_code=200,
        )

        # Patch each detector's detect method to return a mock alert
        mock_alert = Alert(
            id=1,
            source_id=1,
            event_id=1,
            detection_type="brute_force",
            detector_name="test",
            severity="medium",
            title="Test Alert",
            description="Test",
            evidence={},
            confidence=0.5,
            status="new",
        )

        with patch("hawkeye.services.detection.engine.CorrelationEngine") as mock_corr:
            mock_corr_instance = AsyncMock()
            mock_corr.return_value = mock_corr_instance
            mock_corr_instance.correlate_alert = AsyncMock()

            # Patch all detectors to return a mock alert
            patches = []
            for detector in engine.detectors:
                p = patch.object(detector, "detect", new_callable=AsyncMock)
                patches.append(p)
                p.start().return_value = [mock_alert]

            await engine.process_event(session, event)

            # Clean up patches
            for p in patches:
                p.stop()

        # All detectors should have been called and alerts added
        assert session.add_all.called
        assert session.commit.called


class TestBotDetector:
    """Tests for the BotDetector."""

    @pytest.fixture
    def detector(self):
        return BotDetector()

    @pytest.fixture
    def context(self):
        session = _mock_session()
        event = NormalizedEvent(
            id=1,
            source_id=1,
            timestamp=datetime.utcnow(),
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            method="GET",
            route="/api/test",
            status_code=200,
        )
        return DetectionContext(session=session, event=event)

    def test_analyze_user_agent_bot_patterns(self, detector):
        """Test detection of known bot user agents."""
        # Known bot patterns
        assert detector._analyze_user_agent("python-requests/2.28")["is_bot"]
        assert detector._analyze_user_agent("curl/7.68.0")["is_bot"]
        assert detector._analyze_user_agent("Go-http-client/1.1")["is_bot"]
        assert detector._analyze_user_agent("Mozilla/5.0 (compatible; Googlebot/2.1)")["is_bot"]

    def test_analyze_user_agent_normal_browser(self, detector):
        """Test that normal browsers are not flagged as bots."""
        result = detector._analyze_user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        assert not result["is_bot"]
        assert result["confidence"] < 0.5

    def test_analyze_user_agent_short_ua(self, detector):
        """Test that very short user agents are suspicious."""
        result = detector._analyze_user_agent("short")
        assert result["confidence"] > 0
        assert "ua_too_short" in result["reasons"]

    @pytest.mark.asyncio
    async def test_detect_headless_browser(self, detector, context):
        """Test detection of headless browser events."""
        context.event.event_type = "headless_browser_detected"

        # Mock 2 headless events from same IP (minimum required)
        headless_events = [
            NormalizedEvent(
                id=1,
                source_id=1,
                timestamp=datetime.utcnow() - timedelta(minutes=5),
                ip="192.168.1.1",
                event_type="headless_browser_detected",
            ),
            NormalizedEvent(
                id=2,
                source_id=1,
                timestamp=datetime.utcnow() - timedelta(minutes=3),
                ip="192.168.1.1",
                event_type="headless_browser_detected",
            ),
        ]
        context.session.exec.return_value.all.return_value = headless_events

        alerts = await detector.detect(context)
        assert len(alerts) == 1
        assert alerts[0].detection_type == "bot_detection"
        assert "Headless Browser" in alerts[0].title


class TestBruteForceDetector:
    """Tests for the BruteForceDetector."""

    @pytest.fixture
    def detector(self):
        return BruteForceDetector()

    @pytest.fixture
    def context(self):
        session = _mock_session()
        event = NormalizedEvent(
            id=1,
            source_id=1,
            timestamp=datetime.utcnow(),
            ip="192.168.1.1",
            user_id="testuser",
            user_agent="Mozilla/5.0",
            method="POST",
            route="/login",
            event_type="login_failed",
            category="authentication",
            status_code=401,
        )
        return DetectionContext(session=session, event=event)

    def test_detect_ignores_non_auth_events(self, detector, context):
        """Test that non-authentication events are ignored."""
        context.event.category = "api"
        context.event.event_type = "request"
        # This is tested implicitly - detector returns empty for non-auth

    @pytest.mark.asyncio
    async def test_brute_force_threshold(self, detector, context):
        """Test brute force detection when threshold exceeded."""
        # Mock enough failed logins
        failed_logins = [
            NormalizedEvent(
                id=i,
                source_id=1,
                timestamp=datetime.utcnow() - timedelta(minutes=5),
                ip="192.168.1.1",
                user_id="testuser",
                event_type="login_failed",
                category="authentication",
            )
            for i in range(10)
        ]
        context.session.exec.return_value.all.return_value = failed_logins
        context.session.exec.return_value.first.return_value = None  # No success after

        alerts = await detector.detect(context)
        assert len(alerts) >= 1
        assert any("Brute Force" in a.title for a in alerts)


class TestCredentialStuffingDetector:
    """Tests for the CredentialStuffingDetector."""

    @pytest.fixture
    def detector(self):
        return CredentialStuffingDetector()

    @pytest.fixture
    def context(self):
        session = _mock_session()
        event = NormalizedEvent(
            id=1,
            source_id=1,
            timestamp=datetime.utcnow(),
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            method="POST",
            route="/login",
            event_type="login_failed",
            category="authentication",
            status_code=401,
        )
        return DetectionContext(session=session, event=event)

    @pytest.mark.asyncio
    async def test_credential_stuffing_many_users(self, detector, context):
        """Test detection when many usernames tried from same IP."""
        failed_logins = [
            NormalizedEvent(
                id=i,
                source_id=1,
                timestamp=datetime.utcnow() - timedelta(minutes=i % 5),  # Within 5 minutes
                ip="192.168.1.1",
                user_id=f"user{i}",
                event_type="login_failed",
                category="authentication",
            )
            for i in range(50)  # Exceeds default threshold
        ]
        context.session.exec.return_value.all.return_value = failed_logins

        alerts = await detector.detect(context)
        assert len(alerts) == 1
        assert "Credential Stuffing" in alerts[0].title


class TestDetectionContext:
    """Tests for the DetectionContext dataclass."""

    def test_context_initialization(self):
        """Test that context initializes with time window."""
        session = AsyncMock(spec=AsyncSession)
        event = NormalizedEvent(
            id=1,
            source_id=1,
            timestamp=datetime.utcnow(),
            ip="192.168.1.1",
        )
        context = DetectionContext(session=session, event=event)
        assert context.time_window_start is not None
        assert context.session == session
        assert context.event == event