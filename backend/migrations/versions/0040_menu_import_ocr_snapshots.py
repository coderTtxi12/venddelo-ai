"""menu import ocr original + open questions columns

Revision ID: 0040_menu_import_ocr_snapshots
Revises: 0039_nxm_complement_allowlist
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0040_menu_import_ocr_snapshots"
down_revision: str | None = "0039_nxm_complement_allowlist"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assistant_menu_import_sessions",
        sa.Column(
            "ocr_original",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "assistant_menu_import_sessions",
        sa.Column(
            "open_questions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # Backfill from existing draft_batches (first batch).
    op.execute(
        """
        UPDATE assistant_menu_import_sessions AS s
        SET
            ocr_original = COALESCE(
                (
                    SELECT jsonb_build_object(
                        'categories', b->'categories',
                        'promotions', COALESCE(b->'promotions', '[]'::jsonb),
                        'global_rules', COALESCE(b->'global_rules', '[]'::jsonb),
                        'unmapped_text', '[]'::jsonb,
                        'open_questions', COALESCE(b->'open_questions', '[]'::jsonb)
                    )
                    FROM jsonb_array_elements(s.draft_batches) WITH ORDINALITY AS t(b, idx)
                    WHERE idx = 1
                ),
                '{}'::jsonb
            ),
            open_questions = COALESCE(
                (
                    SELECT COALESCE(b->'open_questions', '[]'::jsonb)
                    FROM jsonb_array_elements(s.draft_batches) WITH ORDINALITY AS t(b, idx)
                    WHERE idx = 1
                ),
                '[]'::jsonb
            )
        WHERE jsonb_array_length(COALESCE(s.draft_batches, '[]'::jsonb)) > 0
        """
    )


def downgrade() -> None:
    op.drop_column("assistant_menu_import_sessions", "open_questions")
    op.drop_column("assistant_menu_import_sessions", "ocr_original")
