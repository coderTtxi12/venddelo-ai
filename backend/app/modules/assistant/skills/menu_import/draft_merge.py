from __future__ import annotations

from typing import Any

from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft
from app.modules.assistant.skills.menu_import.extraction import merge_page_drafts


def _batch_to_draft(batch: ImportBatch) -> ImportDraft:
    return ImportDraft(
        categories=batch.categories,
        promotions=batch.promotions,
        global_rules=batch.global_rules,
        unmapped_text=[],
        open_questions=batch.open_questions,
    )


def merge_draft_batches(batches: list[ImportBatch | dict[str, Any]]) -> ImportDraft:
    """Merge all import batches into one draft (promos/rules/questions from batch 0)."""
    models: list[ImportDraft] = []
    for index, entry in enumerate(batches):
        batch = entry if isinstance(entry, ImportBatch) else ImportBatch.model_validate(entry)
        draft = _batch_to_draft(batch)
        if index == 0:
            models.append(draft)
            continue
        models.append(
            ImportDraft(
                categories=draft.categories,
                promotions=[],
                global_rules=[],
                unmapped_text=[],
                open_questions=[],
            )
        )
    return merge_page_drafts(models)
