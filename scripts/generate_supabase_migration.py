#!/usr/bin/env python3
"""Regenerate supabase/migrations/0001_schema.sql from SQLModel metadata.

The generated DDL is the single source of truth for the production schema;
hand-editing 0001 is discouraged. RLS/publication live in 0002 (hand-written).

Run: python scripts/generate_supabase_migration.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable
from sqlmodel import SQLModel

import hawkeye.models.events  # noqa: F401 - registers models

HEADER = """-- HawkEye Supabase migration 0001: base schema.
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   python scripts/generate_supabase_migration.py
-- Source of truth: SQLModel models in hawkeye/models/events.py
-- JSON columns stay JSON (not JSONB): all application queries use CAST
-- to VARCHAR for text matching, which works on both types.
"""


def main() -> None:
    parts = [HEADER]
    for table in SQLModel.metadata.sorted_tables:
        parts.append(
            str(CreateTable(table).compile(dialect=postgresql.dialect())) + ";"
        )
        for idx in table.indexes:
            parts.append(
                str(CreateIndex(idx).compile(dialect=postgresql.dialect())) + ";"
            )
    out_path = Path(__file__).parent.parent / "supabase" / "migrations" / "0001_schema.sql"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
    print(f"wrote {out_path} ({len(parts)} statements)")


if __name__ == "__main__":
    main()
