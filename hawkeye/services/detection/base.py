"""Base detector classes and types."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, Severity
from hawkeye.models.events import Alert, NormalizedEvent


@dataclass
class DetectionContext:
    """Context passed to detectors containing recent events and metadata."""

    session: AsyncSession
    event: NormalizedEvent
    recent_events: list[NormalizedEvent] = field(default_factory=list)
    time_window_start: datetime | None = None

    def __post_init__(self):
        if self.time_window_start is None:
            self.time_window_start = datetime.utcnow() - timedelta(
                minutes=settings.detection_time_window_minutes
            )


class BaseDetector(ABC):
    """Abstract base class for all detectors."""

    name: str = "base"
    detection_type: DetectionType = DetectionType.BRUTE_FORCE
    default_severity: Severity = Severity.MEDIUM
    default_confidence: float = 0.5

    @abstractmethod
    async def detect(self, context: DetectionContext) -> list[Alert]:
        """
        Analyze the context and return a list of alerts if detection triggers.

        Args:
            context: DetectionContext containing the event and related historical data

        Returns:
            List of Alert objects (empty if no detection)
        """
        pass

    def _create_alert(
        self,
        event: NormalizedEvent,
        title: str,
        description: str,
        evidence: dict[str, Any],
        severity: Severity | None = None,
        confidence: float | None = None,
    ) -> Alert:
        """Create a standardized alert."""
        return Alert(
            source_id=event.source_id,
            event_id=event.id,
            detection_type=self.detection_type.value,
            detector_name=self.name,
            severity=(severity or self.default_severity).value,
            title=title,
            description=description,
            evidence=evidence,
            confidence=confidence or self.default_confidence,
            status="new",
        )

    async def _get_recent_events(
        self,
        session: AsyncSession,
        event: NormalizedEvent,
        hours: int = 24,
        filters: dict[str, Any] | None = None,
    ) -> list[NormalizedEvent]:
        """Get recent normalized events matching criteria."""
        since = datetime.utcnow() - timedelta(hours=hours)
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.timestamp >= since,
        )

        if filters:
            for key, value in filters.items():
                if hasattr(NormalizedEvent, key):
                    stmt = stmt.where(getattr(NormalizedEvent, key) == value)

        stmt = stmt.order_by(NormalizedEvent.timestamp.desc()).limit(1000)
        result = await session.exec(stmt)
        return list(result.all())
