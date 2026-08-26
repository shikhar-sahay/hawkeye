#!/usr/bin/env python3
"""
Cleanup script: remove leftover QA/test sources from the Hawkeye database.

Only deletes sources that are BOTH:
  - named like test artifacts ("Test Source", "Source N", "QA Smoke ..."), AND
  - completely empty (no events, alerts, or incidents)

Real seeded/demo sources (Windows Endpoint, Linux Server, Web Application,
API Gateway, Firewall, ...) are never touched.

Run: python scripts/cleanup_test_sources.py [--dry-run]
"""

import asyncio
import re
import sys
from pathlib import Path

from sqlalchemy import delete as sa_delete
from sqlmodel import func, select

sys.path.insert(0, str(Path(__file__).parent.parent))

from hawkeye.database import db
from hawkeye.models.events import (
    Alert,
    ApiKey,
    ApplicationSource,
    Incident,
    IncidentAlert,
    NormalizedEvent,
)

TEST_NAME_PATTERNS = [
    re.compile(r"^test source$", re.IGNORECASE),
    re.compile(r"^source \d+$", re.IGNORECASE),
    re.compile(r"^qa ", re.IGNORECASE),
]


async def cleanup(dry_run: bool = False) -> None:
    async with db.session() as session:
        # Only consider sources that own no normalized events
        event_counts = select(
            NormalizedEvent.source_id, func.count(NormalizedEvent.id)
        ).group_by(NormalizedEvent.source_id)
        rows = (await session.exec(event_counts)).all()
        source_ids_with_events = {r[0] for r in rows}

        sources = list((await session.exec(select(ApplicationSource))).all())
        candidates = []
        for s in sources:
            if s.id in source_ids_with_events:
                continue
            if any(p.match(s.name or "") for p in TEST_NAME_PATTERNS):
                candidates.append(s)

        print(f"Total sources: {len(sources)}")
        print(f"Empty test sources to delete: {len(candidates)}")
        if dry_run:
            for s in candidates[:10]:
                print(f"  would delete id={s.id} name={s.name!r}")
            print("(dry run, nothing deleted)")
            return

        for s in candidates:
            alert_ids = list(
                (await session.exec(select(Alert.id).where(Alert.source_id == s.id))).all()
            )
            if alert_ids:
                await session.execute(
                    sa_delete(IncidentAlert).where(IncidentAlert.alert_id.in_(alert_ids))
                )
            await session.execute(
                sa_delete(Incident).where(Incident.source_id == s.id)
            )
            await session.execute(sa_delete(Alert).where(Alert.source_id == s.id))
            await session.execute(
                sa_delete(NormalizedEvent).where(NormalizedEvent.source_id == s.id)
            )
            await session.execute(sa_delete(ApiKey).where(ApiKey.source_id == s.id))
            await session.delete(s)

        await session.commit()
        print(f"Deleted {len(candidates)} empty test sources.")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(cleanup(dry_run=dry))
