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

# Post-apply phases: import is done from the router's perspective.
IMPORT_ROUTER_IDLE_STATUSES: frozenset[str] = frozenset(
    {
        MenuImportSessionStatus.ENRICHING.value,
        MenuImportSessionStatus.COLLECTING_IMAGES.value,
        MenuImportSessionStatus.MATCHING_IMAGES.value,
        MenuImportSessionStatus.ENHANCING.value,
    }
)


def is_active_status(status: MenuImportSessionStatus | str) -> bool:
    value = status.value if isinstance(status, MenuImportSessionStatus) else status
    return value not in {s.value for s in TERMINAL_STATUSES}
