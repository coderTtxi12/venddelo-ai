from __future__ import annotations

from enum import StrEnum


class MenuImportSessionStatus(StrEnum):
    DISCOVERY = "discovery"
    COLLECTING_SOURCES = "collecting_sources"
    EXTRACTING = "extracting"
    CLARIFYING = "clarifying"
    OPTIMIZING = "optimizing"
    COLLECTING_IMAGES = "collecting_images"
    SELECTING_THEME = "selecting_theme"
    PREVIEW_BATCH = "preview_batch"
    APPLYING = "applying"
    MATCHING_IMAGES = "matching_images"
    ENHANCING = "enhancing"
    ENRICHING = "enriching"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


TERMINAL_STATUSES: frozenset[MenuImportSessionStatus] = frozenset(
    {
        MenuImportSessionStatus.COMPLETED,
        MenuImportSessionStatus.CANCELLED,
    }
)


def is_active_status(status: MenuImportSessionStatus | str) -> bool:
    value = status.value if isinstance(status, MenuImportSessionStatus) else status
    return value not in {s.value for s in TERMINAL_STATUSES}
