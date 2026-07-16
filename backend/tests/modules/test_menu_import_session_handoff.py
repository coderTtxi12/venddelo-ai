import uuid

from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.skills.menu_import.session_handoff import (
    menu_source_attachments,
    new_menu_source_paths,
    replace_import_session_if_needed,
    should_replace_import_session,
)


def _attachment(path: str) -> ChatAttachmentRef:
    return ChatAttachmentRef(
        storage_path=path,
        original_name=path.rsplit("/", 1)[-1],
        mime_type="application/pdf",
        kind="document",
        size_bytes=1024,
    )


class _FakeSession:
    def __init__(self, *, source_files=None, draft_batches=None):
        self.source_files = source_files or []
        self.draft_batches = draft_batches or []


def test_menu_source_attachments_filters_documents_only():
    attachments = [
        _attachment("restaurants/x/menu/a.pdf"),
        ChatAttachmentRef(
            storage_path="restaurants/x/import/inbox/p.webp",
            original_name="p.webp",
            mime_type="image/webp",
            kind="image",
            size_bytes=512,
        ),
    ]
    assert len(menu_source_attachments(attachments)) == 1


def test_should_not_replace_without_new_paths():
    session = _FakeSession(source_files=[{"path": "restaurants/x/menu/a.pdf"}])
    attachments = [_attachment("restaurants/x/menu/a.pdf")]
    assert should_replace_import_session(attachments, session) is False


def test_should_replace_when_new_menu_files_arrive():
    session = _FakeSession(
        source_files=[{"path": "restaurants/x/menu/menu_a.pdf"}],
        draft_batches=[{"batch_index": 0, "categories": []}],
    )
    attachments = [_attachment("restaurants/x/menu/menu_b.pdf")]
    assert should_replace_import_session(attachments, session) is True


def test_replace_import_session_if_needed_uses_committed_cancel(monkeypatch):
    cancelled: list[uuid.UUID] = []
    fake_active = _FakeSession(source_files=[{"path": "restaurants/x/menu/old.png"}])

    class _FakeRepo:
        def get_active_for_restaurant(self, restaurant_id):
            return fake_active

        def cancel_active(self, restaurant_id):
            cancelled.append(restaurant_id)

    class _FakeUow:
        def __enter__(self):
            self.session = object()
            return self

        def __exit__(self, *args):
            return None

        def commit(self):
            return None

        def rollback(self):
            return None

    monkeypatch.setattr(
        "app.modules.assistant.skills.menu_import.session_handoff.SqlAlchemyUnitOfWork",
        _FakeUow,
    )
    monkeypatch.setattr(
        "app.modules.assistant.skills.menu_import.session_handoff.MenuImportSessionRepository",
        lambda _session: _FakeRepo(),
    )

    restaurant_id = uuid.uuid4()
    attachments = [
        ChatAttachmentRef(
            storage_path="restaurants/x/menu/new.png",
            original_name="new.png",
            mime_type="image/png",
            kind="document",
            size_bytes=100,
        )
    ]

    assert replace_import_session_if_needed(
        restaurant_id=restaurant_id,
        attachments=attachments,
    ) is True
    assert cancelled == [restaurant_id]


def test_new_menu_source_paths_detects_unregistered_files():
    session = _FakeSession(source_files=[{"path": "restaurants/x/menu/a.pdf"}])
    attachments = [
        _attachment("restaurants/x/menu/a.pdf"),
        _attachment("restaurants/x/menu/b.pdf"),
    ]
    assert new_menu_source_paths(attachments, session) == ["restaurants/x/menu/b.pdf"]
