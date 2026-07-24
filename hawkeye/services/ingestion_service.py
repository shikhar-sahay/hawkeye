"""Ingestion service - handles event processing pipeline."""

from datetime import datetime

from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.core.normalization import NormalizationEngine
from hawkeye.models.events import NormalizedEvent, RawEvent
from hawkeye.schemas.ingestion import BatchEventsIngest, RawEventIngest
from hawkeye.services.detection import DetectionEngine


class IngestionService:
    """Service for ingesting and processing security events."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.normalizer = NormalizationEngine()
        self.detection_engine = DetectionEngine()

    async def ingest_event(
        self, event: RawEventIngest, source
    ) -> NormalizedEvent:
        """Ingest a single event through the full pipeline."""
        # Create raw event record
        raw_event = RawEvent(
            source_id=source.id,
            received_at=datetime.utcnow(),
            event_timestamp=event.timestamp,
            payload=event.model_dump(mode="json"),
            client_ip=event.ip,
            user_agent=event.user_agent,
        )
        self.session.add(raw_event)
        await self.session.flush()

        # Normalize
        normalized = self.normalizer.normalize(event, source.id)
        normalized.raw_event_id = raw_event.id
        self.session.add(normalized)
        await self.session.flush()

        # Mark raw as processed
        raw_event.processed = True
        self.session.add(raw_event)

        await self.session.commit()
        await self.session.refresh(normalized)

        # Trigger detection engine
        await self.detection_engine.process_event(self.session, normalized)

        return normalized

    async def ingest_batch(
        self, batch: BatchEventsIngest, source
    ) -> tuple[list[NormalizedEvent], list[int]]:
        """Ingest a batch of events efficiently."""
        if not batch.events:
            return [], []

        # Create all raw events first
        raw_events = [
            RawEvent(
                source_id=source.id,
                received_at=datetime.utcnow(),
                event_timestamp=event.timestamp,
                payload=event.model_dump(mode="json"),
                client_ip=event.ip,
                user_agent=event.user_agent,
            )
            for event in batch.events
        ]
        self.session.add_all(raw_events)
        await self.session.flush()

        # Normalize all
        normalized_pairs = self.normalizer.normalize_batch(batch.events, source.id)

        normalized_events = []
        for i, (normalized, raw) in enumerate(normalized_pairs):
            normalized.raw_event_id = raw_events[i].id
            self.session.add(normalized)
            normalized_events.append(normalized)
            raw_events[i].processed = True

        await self.session.flush()
        event_ids = [n.id for n in normalized_events if n.id]

        # Commit all
        await self.session.commit()

        # Trigger detection for each event
        for normalized in normalized_events:
            await self.detection_engine.process_event(self.session, normalized)

        return normalized_events, event_ids
