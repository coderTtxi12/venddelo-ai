"""Detect and reset stale menu import sessions when the user uploads new menu files."""

from __future__ import annotations

import uuid
from typing import Any

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository


def menu_source_attachments(attachments: list[ChatAttachmentRef]) -> list[ChatAttachmentRef]:
    return [attachment for attachment in attachments if attachment.kind == "menu_source"]


def registered_source_paths(session: Any | None) -> set[str]:
    if session is None:
        return set()
    paths: set[str] = set()
    for entry in session.source_files or []:
        if not isinstance(entry, dict):
            continue
        path = str(entry.get("path") or "").strip()
        if path:
            paths.add(path)
    return paths


def new_menu_source_paths(
    attachments: list[ChatAttachmentRef],
    session: Any | None,
) -> list[str]:
    registered = registered_source_paths(session)
    return [
        attachment.storage_path
        for attachment in menu_source_attachments(attachments)
        if attachment.storage_path not in registered
    ]


def should_replace_import_session(
    attachments: list[ChatAttachmentRef],
    session: Any | None,
) -> bool:
    """True when the user attached new menu files for a fresh import attempt."""
    if session is None:
        return False
    new_paths = new_menu_source_paths(attachments, session)
    if not new_paths:
        return False
    # Session already collected sources; new paths in a later turn = new menu upload.
    return bool(session.source_files)


def replace_import_session_if_needed(
    *,
    restaurant_id: uuid.UUID,
    attachments: list[ChatAttachmentRef],
) -> bool:
    """Cancel the active import session when the user uploads unrelated menu files."""
    if not menu_source_attachments(attachments):
        return False

    uow = SqlAlchemyUnitOfWork()
    uow.__enter__()
    try:
        repo = MenuImportSessionRepository(uow.session)
        active = repo.get_active_for_restaurant(restaurant_id)
        if not should_replace_import_session(attachments, active):
            return False
        repo.cancel_active(restaurant_id)
        uow.commit()
        return True
    except Exception:
        uow.rollback()
        raise
    finally:
        uow.__exit__(None, None, None)
